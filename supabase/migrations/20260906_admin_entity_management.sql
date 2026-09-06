-- ============================================================
-- RaidDominion Portal — Gestión de entidades desde /admin
-- Permite al admin, desde `/admin#usuario/<id>`, cambiar el estado
-- del perfil de un usuario y de sus personajes, hermandades y bandas
-- (integradas o no): visibilidad (is_public), verificación de personaje,
-- estado de claim de hermandad e integración/visibilidad de bandas.
--
-- Todos los RPCs: SECURITY DEFINER, check interno de rol 'admin',
-- SET search_path = '', GRANT EXECUTE TO authenticated y
-- registro en raiddominion_audit_log. → Aplicar manualmente en el
-- SQL Editor del proyecto RaidDominion (ver §8 del AGENTS.md).
-- ============================================================

-- ─── raiddominion_admin_get_user_entities ───────────────────────────────
-- Devuelve en un solo RPC el perfil y las entidades (personajes,
-- hermandades, bandas) de un usuario. Solo admin.
CREATE OR REPLACE FUNCTION public.raiddominion_admin_get_user_entities(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_profile jsonb;
    v_chars jsonb;
    v_guilds jsonb;
    v_bands jsonb;
BEGIN
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = auth.uid();

    IF v_role <> 'admin' THEN
        RAISE EXCEPTION 'No autorizado: se requiere admin.';
    END IF;

    -- Perfil público del usuario (sin email; el email ya lo trae el listado)
    SELECT COALESCE(jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'character_name', p.character_name,
        'realm', p.realm,
        'slug', p.slug,
        'role', p.role,
        'is_public', p.is_public,
        'created_at', p.created_at
    ), '{}'::jsonb)
    INTO v_profile
    FROM public.raiddominion_profiles p
    WHERE p.id = p_user_id;

    -- Personajes del usuario
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'realm', c.realm,
        'server', c.server,
        'class', c.class,
        'level', c.level,
        'avg_ilvl', c.avg_ilvl,
        'slug', c.slug,
        'is_public', c.is_public,
        'member_verified', c.member_verified,
        'sv_is_gm', c.sv_is_gm,
        'sv_guild_name', c.sv_guild_name,
        'created_at', c.created_at
    ) ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_chars
    FROM public.raiddominion_characters c
    WHERE c.user_id = p_user_id;

    -- Hermandades del usuario (donde es owner)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', g.id,
        'slug', g.slug,
        'name', g.name,
        'realm', g.realm,
        'server', g.server,
        'faction', g.faction,
        'claim_status', g.claim_status,
        'is_public', g.is_public,
        'created_at', g.created_at
    ) ORDER BY g.created_at DESC), '[]'::jsonb)
    INTO v_guilds
    FROM public.raiddominion_guilds g
    WHERE g.owner_id = p_user_id;

    -- Bandas del usuario (todas, integradas o no). guild_id = atribución real
    -- al portal (se escribe al aprobar el GM); integration_status muestra la
    -- propuesta. Se incluyen ambos para que el admin vea el estado completo.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'slug', b.slug,
        'name', b.name,
        'icon', b.icon,
        'schedule', b.schedule,
        'guild_id', b.guild_id,
        'integration_target_guild_id', b.integration_target_guild_id,
        'is_public', b.is_public,
        'integration_status', b.integration_status,
        'character_name', b.character_name,
        'character_realm', b.character_realm,
        'created_at', b.created_at
    ) ORDER BY b.created_at DESC), '[]'::jsonb)
    INTO v_bands
    FROM public.raiddominion_bands b
    WHERE b.owner_id = p_user_id;

    RETURN jsonb_build_object(
        'profile', v_profile,
        'characters', v_chars,
        'guilds', v_guilds,
        'bands', v_bands
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_admin_get_user_entities(UUID) TO authenticated;

-- ─── raiddominion_admin_set_profile_field ───────────────────────────────
-- Cambia un campo simple del perfil de otro usuario. Solo admin.
-- Campos permitidos: display_name, character_name, realm, is_public.
CREATE OR REPLACE FUNCTION public.raiddominion_admin_set_profile_field(
    p_user_id UUID,
    p_field TEXT,
    p_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_value text;
    v_bool_value boolean;
BEGIN
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = auth.uid();

    IF v_role <> 'admin' THEN
        RAISE EXCEPTION 'No autorizado: se requiere admin.';
    END IF;

    IF p_field = 'display_name' OR p_field = 'character_name' OR p_field = 'realm' THEN
        v_value := NULLIF(TRIM(p_value), '');

        UPDATE public.raiddominion_profiles
        SET
            display_name = CASE WHEN p_field = 'display_name' THEN v_value ELSE display_name END,
            character_name = CASE WHEN p_field = 'character_name' THEN v_value ELSE character_name END,
            realm = CASE WHEN p_field = 'realm' THEN v_value ELSE realm END,
            updated_at = timezone('utc'::text, now())
        WHERE id = p_user_id;
    ELSIF p_field = 'is_public' THEN
        v_bool_value := (p_value IN ('true', '1', 'yes'));

        UPDATE public.raiddominion_profiles
        SET is_public = v_bool_value,
            updated_at = timezone('utc'::text, now())
        WHERE id = p_user_id;
    ELSE
        RAISE EXCEPTION 'Campo no permitido.';
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuario no encontrado.';
    END IF;

    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (
        auth.uid(),
        'profile_field_changed',
        p_user_id::text,
        jsonb_build_object('field', p_field, 'value', COALESCE(v_value, v_bool_value::text))
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_admin_set_profile_field(UUID, TEXT, TEXT) TO authenticated;

-- ─── raiddominion_admin_set_character_status ────────────────────────────
-- Cambia is_public y/o member_verified de un personaje (de cualquier usuario).
-- Solo admin. Ambos booleans son obligatorios (la UI siempre los envía);
-- al marcar member_verified se fija verified_at si antes no lo estaba.
CREATE OR REPLACE FUNCTION public.raiddominion_admin_set_character_status(
    p_character_id UUID,
    p_is_public BOOLEAN,
    p_member_verified BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_owner uuid;
    v_new_mv boolean;
BEGIN
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = auth.uid();

    IF v_role <> 'admin' THEN
        RAISE EXCEPTION 'No autorizado: se requiere admin.';
    END IF;

    SELECT user_id INTO v_owner FROM public.raiddominion_characters WHERE id = p_character_id;

    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Personaje no encontrado.';
    END IF;

    v_new_mv := COALESCE(p_member_verified, FALSE);

    UPDATE public.raiddominion_characters
    SET is_public = p_is_public,
        member_verified = v_new_mv,
        verified_at = CASE
            WHEN v_new_mv AND member_verified = FALSE THEN timezone('utc'::text, now())
            ELSE verified_at
        END,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_character_id;

    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (
        auth.uid(),
        'character_status_changed',
        p_character_id::text,
        jsonb_build_object(
            'owner_id', v_owner,
            'is_public', p_is_public,
            'member_verified', v_new_mv
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_admin_set_character_status(UUID, BOOLEAN, BOOLEAN) TO authenticated;

-- ─── raiddominion_admin_set_guild_status ────────────────────────────────
-- Cambia is_public y/o claim_status de una hermandad (de cualquier usuario).
-- Solo admin. Si p_claim_status es NULL no se toca; si se marca 'verified'
-- se promueve al owner a guild_master (paridad con verify_guild_claim).
CREATE OR REPLACE FUNCTION public.raiddominion_admin_set_guild_status(
    p_guild_id UUID,
    p_is_public BOOLEAN,
    p_claim_status TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_owner uuid;
    v_current_claim text;
    v_new_claim text;
BEGIN
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = auth.uid();

    IF v_role <> 'admin' THEN
        RAISE EXCEPTION 'No autorizado: se requiere admin.';
    END IF;

    SELECT owner_id, claim_status INTO v_owner, v_current_claim
    FROM public.raiddominion_guilds WHERE id = p_guild_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Hermandad no encontrada.';
    END IF;

    v_new_claim := COALESCE(p_claim_status, v_current_claim);

    IF v_new_claim NOT IN ('pending', 'verified', 'rejected') THEN
        RAISE EXCEPTION 'Estado de claim inválido.';
    END IF;

    UPDATE public.raiddominion_guilds
    SET is_public = p_is_public,
        claim_status = v_new_claim,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_guild_id;

    -- Paridad: hermandad verificada ⇒ el owner asciende a GM, SOLO si aún
    -- es visitante/member (nunca demover a un admin/moderador ya existente).
    IF v_new_claim = 'verified' AND v_owner IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.raiddominion_profiles p
            WHERE p.id = v_owner AND p.role IN ('visitante', 'member')
        ) THEN
            UPDATE public.raiddominion_profiles
            SET role = 'guild_master',
                is_guild_master = TRUE,
                updated_at = timezone('utc'::text, now())
            WHERE id = v_owner;

            INSERT INTO public.user_apps (user_id, app_slug, role, status)
            VALUES (v_owner, 'raiddominion', 'guild_master', 'active')
            ON CONFLICT (user_id, app_slug) DO UPDATE SET role = EXCLUDED.role;
        END IF;
    END IF;

    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (
        auth.uid(),
        'guild_status_changed',
        p_guild_id::text,
        jsonb_build_object(
            'owner_id', v_owner,
            'is_public', p_is_public,
            'claim_status', v_new_claim
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_admin_set_guild_status(UUID, BOOLEAN, TEXT) TO authenticated;

-- ─── raiddominion_admin_set_band_status ─────────────────────────────────
-- Cambia is_public y/o integration_status de una banda (de cualquier usuario).
-- Solo admin. integration_status: 'none' | 'pending' | 'approved' | 'rejected'.
CREATE OR REPLACE FUNCTION public.raiddominion_admin_set_band_status(
    p_band_id UUID,
    p_is_public BOOLEAN,
    p_integration_status TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_owner uuid;
    v_current_status text;
    v_new_status text;
BEGIN
    SELECT role INTO v_role FROM public.raiddominion_profiles WHERE id = auth.uid();

    IF v_role <> 'admin' THEN
        RAISE EXCEPTION 'No autorizado: se requiere admin.';
    END IF;

    SELECT owner_id, integration_status INTO v_owner, v_current_status
    FROM public.raiddominion_bands WHERE id = p_band_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Banda no encontrada.';
    END IF;

    v_new_status := COALESCE(p_integration_status, v_current_status);

    IF v_new_status NOT IN ('none', 'pending', 'approved', 'rejected') THEN
        RAISE EXCEPTION 'Estado de integración inválido.';
    END IF;

    UPDATE public.raiddominion_bands
    SET is_public = p_is_public,
        integration_status = v_new_status,
        integration_decided_at = CASE
            WHEN v_new_status IN ('approved', 'rejected') THEN timezone('utc'::text, now())
            ELSE integration_decided_at
        END,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_band_id;

    INSERT INTO public.raiddominion_audit_log (actor_id, action, target, details)
    VALUES (
        auth.uid(),
        'band_status_changed',
        p_band_id::text,
        jsonb_build_object(
            'owner_id', v_owner,
            'is_public', p_is_public,
            'integration_status', v_new_status
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.raiddominion_admin_set_band_status(UUID, BOOLEAN, TEXT) TO authenticated;
