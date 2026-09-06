-- ============================================================
-- RaidDominion Portal — Reclamo GM con 1 personaje + reconciliación de reino
--
-- Decisión de producto (2026-09-25, tras QA de un SV de otra cuenta):
--   1) RECLAMO: si el SV acredita maestría (registry.guild.isGM), bastan
--      UN personaje validado para reclamar la hermandad (antes exigía 3).
--      La promoción a Miembro también valida con UN personaje cuando el SV
--      acredita isGM (antes exigía 2).
--   2) ANTI-DUPLICADO: el anti-falseo de upsert_character coincidía solo por
--      (name, realm) exactos; si una cuenta registró "X"/'' y el SV trae
--      "X"/"Bennu" (o viceversa, eje del fallback legacy v2), se creaban dos
--      filas en dos cuentas. Ahora: mismo NOMBRE con reino vacío en CUALQUIER
--      lado = mismo personaje → update propio / conflict ajeno.
--   3) GUARD de reclamo: si el personaje PRINCIPAL del SV pertenece a otra
--      cuenta, no se reclama su hermandad (refuerza "a toda costa").
--   4) PRE-CHECK de upload (check_character_owner): el cliente consulta ANTES
--      de persistir si el principal del archivo ya pertenece a otra cuenta;
--      si es así, NO guarda historial ni personajes (SV ajeno). Además, el
--      front solo registra desde registry: la tabla `characters` del SV no es
--      fuente de registro.
--
-- Bases canónicas reescritas ÍNTEGRAS (patrón del repo, no editar las
-- migraciones previas): 20260827 upsert_character v4,
-- 20260830 try_promote_member, 20260905 claim_from_sv.
--
-- Reglas: solo tablas raiddominion_, IF EXISTS, SECURITY DEFINER +
-- SET search_path='', GRANT EXECUTE TO authenticated. Sin tocar otras apps.
-- ============================================================

-- ─── 1) try_promote_member: valida con UN personaje si el SV acredita isGM
-- Base canónica: 20260830_promote_member_and_claim.sql
DROP FUNCTION IF EXISTS public.raiddominion_try_promote_member();
DROP FUNCTION IF EXISTS public.raiddominion_try_promote_member(UUID);
CREATE OR REPLACE FUNCTION public.raiddominion_try_promote_member(p_sv_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_role TEXT;
    v_char_count INT;
    v_sv_is_gm BOOLEAN := FALSE;
    v_raw JSONB;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RETURN jsonb_build_object('promoted', FALSE, 'reason', 'sin perfil');
    END IF;

    -- ¿El SV acredita maestría (isGM)? Permite validar con UN personaje.
    -- Formato v3: registries[*].guild.isGM ; fallback plano: registryGuild.
    IF p_sv_id IS NOT NULL THEN
        SELECT raw INTO v_raw
        FROM public.raiddominion_saved_variables
        WHERE id = p_sv_id AND user_id = v_user AND raw IS NOT NULL
        LIMIT 1;
        IF v_raw IS NOT NULL THEN
            v_sv_is_gm := COALESCE(NULLIF(v_raw -> 'registryGuild' ->> 'isGM', '')::boolean, FALSE)
                          OR (jsonb_typeof(v_raw -> 'registries') = 'array'
                              AND EXISTS (
                                  SELECT 1 FROM jsonb_array_elements(v_raw -> 'registries') AS e
                                  WHERE COALESCE((e -> 'guild' ->> 'isGM')::boolean, FALSE) = TRUE
                              ));
        END IF;
    END IF;

    -- Regla (20260925): cuenta con >= 1 personaje y SV con isGM → valida todos
    -- sus personajes y promueve a member. Regla previa (20260830): >= 2
    -- personajes acumulados valida y promueve igualmente. Jamás degrada.
    SELECT COUNT(*) INTO v_char_count
    FROM public.raiddominion_characters
    WHERE user_id = v_user;

    IF (v_sv_is_gm AND v_char_count >= 1) OR v_char_count >= 2 THEN
        UPDATE public.raiddominion_characters
        SET member_verified = TRUE, verified_at = now()
        WHERE user_id = v_user AND member_verified = FALSE;

        IF v_role = 'visitante' THEN
            UPDATE public.raiddominion_profiles SET role = 'member', updated_at = now() WHERE id = v_user;

            UPDATE public.user_apps SET role = 'member'
            WHERE user_id = v_user AND app_slug = 'raiddominion';
        END IF;

        INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
        VALUES (v_user, 'promote_multi_char', COALESCE(p_sv_id::text, v_user::text),
                jsonb_build_object('characters', v_char_count,
                                   'modo', CASE WHEN v_sv_is_gm THEN 'gm_isgm' ELSE 'multi_char' END));

        RETURN jsonb_build_object('promoted', TRUE,
                                  'reason', CASE WHEN v_sv_is_gm THEN 'gm_isgm' ELSE 'multi_char' END,
                                  'modo', CASE WHEN v_sv_is_gm THEN 'gm_isgm' ELSE 'multi_char' END);
    END IF;

    RETURN jsonb_build_object('promoted', FALSE, 'reason', 'sin suficientes personajes');
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_try_promote_member(UUID) TO authenticated;

-- ─── 2) claim_from_sv: >= 1 personaje validado + guard de SV ajeno ────────
-- Base canónica: 20260905_fix_guild_server.sql (server en hermandades).
DROP FUNCTION IF EXISTS public.raiddominion_claim_from_sv(UUID);
CREATE OR REPLACE FUNCTION public.raiddominion_claim_from_sv(p_sv_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_role TEXT;
    v_raw JSONB;
    v_primary UUID;
    v_candidates JSONB;
    v_cand JSONB;
    v_rg JSONB;
    v_p JSONB;
    v_guild_name TEXT;
    v_realm TEXT;
    v_server TEXT;
    v_faction TEXT;
    v_base_slug TEXT;
    v_slug TEXT;
    v_i INT;
    v_guild_id UUID;
    v_skipped_other_gm INT := 0;
    v_char_count INT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'No autenticado';
    END IF;

    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = v_user;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Perfil no encontrado.';
    END IF;
    IF v_role NOT IN ('member', 'guild_master', 'moderator', 'admin') THEN
        RAISE EXCEPTION 'Requiere ser Miembro o Maestro de Hermandad.';
    END IF;

    -- Reclamo (20260925): el SV con isGM valida con UN personaje validado
    -- (decisión de producto). Un guild_master verificado re-verifica o reclama
    -- otra sin esta restricción. Staff (admin/moderator) cumple igual.
    IF v_role <> 'guild_master' THEN
        SELECT COUNT(*) INTO v_char_count
        FROM public.raiddominion_characters
        WHERE user_id = v_user AND member_verified = TRUE;
        IF v_char_count < 1 THEN
            RAISE EXCEPTION 'Para reclamar una hermandad se requiere al menos un personaje validado.';
        END IF;
    END IF;

    -- El SV debe pertenecer al usuario
    SELECT raw INTO v_raw
    FROM public.raiddominion_saved_variables
    WHERE id = p_sv_id AND user_id = v_user AND raw IS NOT NULL
    LIMIT 1;
    IF v_raw IS NULL THEN
        RAISE EXCEPTION 'SV no encontrado en tu historial.';
    END IF;

    -- GUARD (20260925): si el personaje PRINCIPAL del SV pertenece a OTRA
    -- cuenta, la hermandad no se reclama desde aquí. Evita que una cuenta
    -- validada con cualquier personaje reclame la guild de un SV ajeno.
    IF v_raw -> 'player' ? 'name' THEN
        IF EXISTS (
            SELECT 1 FROM public.raiddominion_characters
            WHERE user_id <> v_user
              AND lower(name) = lower(v_raw -> 'player' ->> 'name')
              AND (NULLIF(trim(COALESCE(v_raw -> 'player' ->> 'realm', '')), '') IS NULL
                   OR NULLIF(trim(realm), '') IS NULL
                   OR lower(COALESCE(realm, '')) = lower(COALESCE(v_raw -> 'player' ->> 'realm', '')))
        ) THEN
            RAISE EXCEPTION 'El personaje principal de este SavedVariables pertenece a otra cuenta; no puedes reclamar su hermandad.';
        END IF;
    END IF;

    -- Candidatas: todas las hermandades del SV donde isGM=true.
    IF jsonb_typeof(v_raw -> 'registries') = 'array' THEN
        SELECT jsonb_agg(jsonb_build_object('guild', e -> 'guild', 'player', e -> 'player'))
        INTO v_candidates
        FROM jsonb_array_elements(v_raw -> 'registries') AS e
        WHERE e -> 'guild' ? 'name'
          AND COALESCE((e -> 'guild' ->> 'isGM')::boolean, FALSE) = TRUE;
    END IF;
    IF v_candidates IS NULL
       AND v_raw -> 'registryGuild' ? 'name'
       AND COALESCE((v_raw -> 'registryGuild' ->> 'isGM')::boolean, FALSE) = TRUE THEN
        v_candidates := jsonb_build_array(jsonb_build_object(
            'guild', v_raw -> 'registryGuild', 'player', v_raw -> 'player'));
    END IF;

    IF v_candidates IS NULL OR jsonb_array_length(v_candidates) = 0 THEN
        RAISE EXCEPTION 'El SavedVariables no acredita maestría de hermandad (registry.guild.isGM).';
    END IF;

    FOR v_cand IN SELECT value FROM jsonb_array_elements(v_candidates) LOOP
        v_rg := v_cand -> 'guild';
        v_guild_name := trim(COALESCE(v_rg ->> 'name', ''));
        CONTINUE WHEN v_guild_name = '' OR length(v_guild_name) < 2;

        v_p := v_cand -> 'player';
        v_server := NULLIF(trim(COALESCE(v_p ->> 'server', '')), '');

        SELECT id INTO v_guild_id
        FROM public.raiddominion_guilds
        WHERE owner_id = v_user AND lower(name) = lower(v_guild_name)
        ORDER BY created_at
        LIMIT 1;
        IF FOUND THEN
            UPDATE public.raiddominion_guilds
            SET realm = COALESCE(NULLIF(trim(COALESCE(v_rg ->> 'realm', '')), ''), realm),
                server = COALESCE(v_server, server),
                claim_status = 'verified',
                updated_at = timezone('utc'::text, now())
            WHERE id = v_guild_id;
            PERFORM public.raiddominion_set_snapshot_ranks(v_guild_id, v_rg -> 'ranks');
            IF v_primary IS NULL THEN v_primary := v_guild_id; END IF;
            CONTINUE;
        END IF;

        v_faction := NULL;
        IF v_p ? 'name' AND jsonb_typeof(v_raw -> 'characters') = 'object' THEN
            SELECT value ->> 'faction' INTO v_faction
            FROM jsonb_each(v_raw -> 'characters')
            WHERE lower(split_part(key, '-', 1)) = lower(v_p ->> 'name')
              AND (NULLIF(trim(COALESCE(v_p ->> 'realm', '')), '') IS NULL
                   OR lower(COALESCE(value ->> 'realm', '')) = lower(v_p ->> 'realm'))
            LIMIT 1;
        END IF;
        v_faction := NULLIF(trim(COALESCE(v_faction, '')), '');

        v_realm := NULLIF(trim(COALESCE(v_rg ->> 'realm', '')), '');
        IF v_realm IS NULL AND v_p ? 'realm' THEN
            v_realm := NULLIF(trim(v_p ->> 'realm'), '');
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.raiddominion_guilds
            WHERE owner_id <> v_user
              AND lower(name) = lower(v_guild_name)
              AND (v_realm IS NULL
                   OR NULLIF(realm, '') IS NULL
                   OR lower(realm) = lower(v_realm))
        ) THEN
            v_skipped_other_gm := v_skipped_other_gm + 1;
            INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
            VALUES (v_user, 'guild_claim_skipped_existing_gm', v_guild_name,
                    jsonb_build_object('sv', p_sv_id, 'reason', 'gm ya registrado'));
            CONTINUE;
        END IF;

        v_base_slug := lower(regexp_replace(trim(v_guild_name), '[^a-zA-Z0-9]+', '-', 'g'));
        v_base_slug := btrim(v_base_slug, '-');
        IF v_base_slug = '' THEN CONTINUE; END IF;
        v_base_slug := left(v_base_slug, 40);
        v_slug := v_base_slug;
        v_i := 1;
        WHILE EXISTS (SELECT 1 FROM public.raiddominion_guilds WHERE slug = v_slug) LOOP
            v_i := v_i + 1;
            v_slug := v_base_slug || '-' || v_i::text;
        END LOOP;

        INSERT INTO public.raiddominion_guilds (
            slug, name, realm, server, faction, owner_id, claim_status, is_public
        )
        VALUES (v_slug, v_guild_name, v_realm, v_server, v_faction, v_user, 'verified', FALSE)
        RETURNING id INTO v_guild_id;

        PERFORM public.raiddominion_set_snapshot_ranks(v_guild_id, v_rg -> 'ranks');

        IF v_primary IS NULL THEN v_primary := v_guild_id; END IF;

        INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
        VALUES (v_user, 'guild_claim_from_sv', v_guild_id::text,
                jsonb_build_object('sv', p_sv_id, 'slug', v_slug,
                                   'guild', v_guild_name));
    END LOOP;

    IF v_primary IS NULL THEN
        IF v_skipped_other_gm > 0 THEN
            RAISE EXCEPTION 'Esa hermandad ya tiene un maestro registrado en el portal.';
        END IF;
        RAISE EXCEPTION 'El SavedVariables no acredita maestría de hermandad (registry.guild.isGM).';
    END IF;

    IF v_role NOT IN ('moderator', 'admin') THEN
        UPDATE public.raiddominion_profiles
        SET role = 'guild_master', is_guild_master = TRUE,
            character_name = COALESCE(v_raw -> 'player' ->> 'name', character_name),
            updated_at = now()
        WHERE id = v_user;
    ELSE
        UPDATE public.raiddominion_profiles
        SET is_guild_master = TRUE,
            character_name = COALESCE(v_raw -> 'player' ->> 'name', character_name),
            updated_at = now()
        WHERE id = v_user;
    END IF;

    INSERT INTO public.user_apps (user_id, app_slug, role, status)
    VALUES (v_user, 'raiddominion', 'guild_master', 'active')
    ON CONFLICT (user_id, app_slug) DO UPDATE SET role = 'guild_master';

    RETURN v_primary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_claim_from_sv(UUID) TO authenticated;

-- ─── 3) upsert_character: reconciliación por NOMBRE cuando falta reino ────
-- Base canónica: 20260827_character_slug_readable.sql (v4, slug legible).
-- Añade el paso 2 tras el anti-falseo exacto (name, realm):
--   * si NO hay coincidencia exacta pero existe el mismo NOMBRE con reino
--     vacío en CUALQUIER lado → SE CONSIDERA EL MISMO personaje:
--       - propia cuenta: funde (rellena/ conserva realm, ajusta slug) 'updated'
--       - otra cuenta: 'conflict' (evita el duplicado entre cuentas)
--   * mismo nombre con AMBOS reinos explícitos y distintos → insert legítimo
--     (personajes distintos en reinos distintos).
DROP FUNCTION IF EXISTS public.raiddominion_upsert_character(UUID, JSONB, TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.raiddominion_upsert_character(
    p_sv_id UUID,
    p_player JSONB,
    p_saved_at TEXT DEFAULT NULL,
    p_guild JSONB DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_existing UUID;
    v_owner UUID;
    v_name TEXT;
    v_realm TEXT;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    v_name := NULLIF(trim(p_player->>'name'), '');
    IF v_name IS NULL OR length(v_name) > 32 THEN
        RAISE EXCEPTION 'personaje inválido';
    END IF;
    v_realm := NULLIF(trim(p_player->>'realm'), '');

    -- 1) Anti-falseo: ¿el (nombre, reino) ya pertenece a otra cuenta?
    SELECT id, user_id INTO v_existing, v_owner
    FROM public.raiddominion_characters
    WHERE lower(name) = lower(v_name)
      AND lower(COALESCE(realm, '')) = lower(COALESCE(v_realm, ''))
    ORDER BY created_at, id
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
        IF v_owner = v_user THEN
            UPDATE public.raiddominion_characters SET
                sv_upload_id = p_sv_id,
                class = COALESCE(NULLIF(p_player->>'class', ''), class),
                class_file = COALESCE(NULLIF(p_player->>'classFile', ''), class_file),
                race = COALESCE(NULLIF(p_player->>'race', ''), race),
                race_file = COALESCE(NULLIF(p_player->>'raceFile', ''), race_file),
                server = COALESCE(NULLIF(trim(p_player->>'server'), ''), server),
                level = COALESCE((p_player->>'level')::int, level),
                talent_spec = COALESCE(NULLIF(p_player->>'talentSpec', ''), talent_spec),
                avg_ilvl = COALESCE((p_player->>'avgIlvl')::numeric, avg_ilvl),
                equipment = CASE WHEN jsonb_typeof(p_player->'equipment') = 'array'
                                 AND jsonb_array_length(p_player->'equipment') > 0
                            THEN p_player->'equipment' ELSE equipment END,
                sv_guild_name = CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'name'), '') ELSE NULL END,
                sv_guild_rank = CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'rank'), '') ELSE NULL END,
                sv_is_gm = CASE WHEN p_guild IS NOT NULL THEN COALESCE((p_guild->>'isGM')::boolean, FALSE) ELSE FALSE END,
                slug = CASE
                           WHEN lower(COALESCE(realm, '')) <> lower(COALESCE(v_realm, ''))
                             OR lower(name) <> lower(v_name)
                           THEN public.raiddominion_make_character_slug(v_name, v_realm, id)
                           ELSE slug
                       END,
                updated_at = now()
            WHERE id = v_existing;
            RETURN 'updated';
        END IF;
        RETURN 'conflict';
    END IF;

    -- 2) Reconciliación por NOMBRE cuando al menos UN lado no declaró reino.
    --    Un reino vacío es falta de dato, no un reino distinto: si el mismo
    --    nombre existe con reino NULL/'' (o el incoming viene sin reino),
    --    se trata del MISMO personaje. Cierra el duplicado entre cuentas
    --    ("X"/'' vs "X"/"Bennu") y el doble registro dentro de una cuenta.
    IF v_realm IS NULL THEN
        SELECT id, user_id INTO v_existing, v_owner
        FROM public.raiddominion_characters
        WHERE lower(name) = lower(v_name)
        ORDER BY created_at, id
        LIMIT 1;
    ELSE
        SELECT id, user_id INTO v_existing, v_owner
        FROM public.raiddominion_characters
        WHERE lower(name) = lower(v_name)
          AND NULLIF(trim(realm), '') IS NULL
        ORDER BY created_at, id
        LIMIT 1;
    END IF;

    IF v_existing IS NOT NULL THEN
        IF v_owner = v_user THEN
            UPDATE public.raiddominion_characters SET
                sv_upload_id = p_sv_id,
                class = COALESCE(NULLIF(p_player->>'class', ''), class),
                class_file = COALESCE(NULLIF(p_player->>'classFile', ''), class_file),
                race = COALESCE(NULLIF(p_player->>'race', ''), race),
                race_file = COALESCE(NULLIF(p_player->>'raceFile', ''), race_file),
                server = COALESCE(NULLIF(trim(p_player->>'server'), ''), server),
                realm = COALESCE(realm, v_realm),
                level = COALESCE((p_player->>'level')::int, level),
                talent_spec = COALESCE(NULLIF(p_player->>'talentSpec', ''), talent_spec),
                avg_ilvl = COALESCE((p_player->>'avgIlvl')::numeric, avg_ilvl),
                equipment = CASE WHEN jsonb_typeof(p_player->'equipment') = 'array'
                                 AND jsonb_array_length(p_player->'equipment') > 0
                            THEN p_player->'equipment' ELSE equipment END,
                sv_guild_name = CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'name'), '') ELSE NULL END,
                sv_guild_rank = CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'rank'), '') ELSE NULL END,
                sv_is_gm = CASE WHEN p_guild IS NOT NULL THEN COALESCE((p_guild->>'isGM')::boolean, FALSE) ELSE FALSE END,
                slug = CASE
                           WHEN COALESCE(realm, v_realm) IS DISTINCT FROM realm
                             OR lower(name) <> lower(v_name)
                           THEN public.raiddominion_make_character_slug(v_name, COALESCE(realm, v_realm), id)
                           ELSE slug
                       END,
                updated_at = now()
            WHERE id = v_existing;
            RETURN 'updated';
        END IF;
        RETURN 'conflict';
    END IF;

    INSERT INTO public.raiddominion_characters (
        user_id, sv_upload_id, name, realm, server, slug, class, class_file, race, race_file,
        level, talent_spec, avg_ilvl, equipment,
        sv_guild_name, sv_guild_rank, sv_is_gm
    ) VALUES (
        v_user, p_sv_id, v_name, v_realm,
        NULLIF(trim(p_player->>'server'), ''),
        public.raiddominion_make_character_slug(v_name, v_realm),
        NULLIF(p_player->>'class', ''), NULLIF(p_player->>'classFile', ''),
        NULLIF(p_player->>'race', ''), NULLIF(p_player->>'raceFile', ''),
        (p_player->>'level')::int,
        NULLIF(p_player->>'talentSpec', ''),
        (p_player->>'avgIlvl')::numeric,
        COALESCE(p_player->'equipment', '[]'::jsonb),
        CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'name'), '') ELSE NULL END,
        CASE WHEN p_guild IS NOT NULL THEN NULLIF(trim(p_guild->>'rank'), '') ELSE NULL END,
        CASE WHEN p_guild IS NOT NULL THEN COALESCE((p_guild->>'isGM')::boolean, FALSE) ELSE FALSE END
    );

    RETURN 'created';
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_upsert_character(UUID, JSONB, TEXT, JSONB) TO authenticated;

-- ─── 4) check_character_owner: guardia pre-guardado de SV ajeno ──────────
-- Consulta SOLO de lectura (devuelve 'other' | 'mine' | 'free') que el upload
-- usa ANTES de persistir nada: si el personaje PRINCIPAL del archivo ya
-- pertenece a OTRA cuenta (coincidencia por nombre con reino tolerante: un
-- reino vacío en cualquier lado = mismo personaje), el SV es ajeno y el
-- cliente NO guarda historial ni personajes.
-- Orden deliberado (20260925): 'other' se evalúa ANTES que 'mine'. Si la misma
-- cuenta tiene una fila legacy sin reino y otra cuenta tiene "X"/Reino, hay un
-- duplicado real → se reporta 'other' ("a toda costa": bloquea, no agranda).
-- Reglas: solo tablas raiddominion_, SECURITY DEFINER + search_path='',
-- GRANT EXECUTE TO authenticated.
DROP FUNCTION IF EXISTS public.raiddominion_check_character_owner(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.raiddominion_check_character_owner(
    p_name TEXT,
    p_realm TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'no autenticado';
    END IF;

    -- 1) ¿Pertenece a OTRA cuenta? (match nombre + reino tolerante)
    IF EXISTS (
        SELECT 1 FROM public.raiddominion_characters
        WHERE lower(name) = lower(trim(COALESCE(p_name, '')))
          AND (NULLIF(trim(COALESCE(p_realm, '')), '') IS NULL
               OR NULLIF(trim(realm), '') IS NULL
               OR lower(COALESCE(realm, '')) = lower(COALESCE(p_realm, '')))
          AND user_id <> v_user
    ) THEN
        RETURN 'other';
    END IF;

    -- 2) ¿Es de ESTA cuenta? (misma tolerancia de reino)
    IF EXISTS (
        SELECT 1 FROM public.raiddominion_characters
        WHERE lower(name) = lower(trim(COALESCE(p_name, '')))
          AND (NULLIF(trim(COALESCE(p_realm, '')), '') IS NULL
               OR NULLIF(trim(realm), '') IS NULL
               OR lower(COALESCE(realm, '')) = lower(COALESCE(p_realm, '')))
          AND user_id = v_user
    ) THEN
        RETURN 'mine';
    END IF;

    RETURN 'free';
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_check_character_owner(TEXT, TEXT) TO authenticated;

-- ─── 5) DIAGNÓSTICO (solo lectura, ejecutar aparte si se desea) ────────────
-- Personajes con el MISMO nombre en MÁS DE UNA cuenta (posible duplicado real
-- por reino ausente/divergente antes de esta migración). Si devuelve filas,
-- contactar a moderación para decidir la limpieza manual correcta.
--
-- SELECT lower(name) AS nombre,
--        count(DISTINCT user_id)      AS cuentas,
--        array_agg(DISTINCT user_id::text)              AS ids,
--        array_agg(DISTINCT COALESCE(realm, ''))        AS reinos
-- FROM public.raiddominion_characters
-- GROUP BY lower(name)
-- HAVING count(DISTINCT user_id) > 1
-- ORDER BY nombre;