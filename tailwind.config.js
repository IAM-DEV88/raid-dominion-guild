import animations from "@midudev/tailwind-animations";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      screens: {
        'dsm': '320px',
      },
      colors: {
        normal: "rgba(221, 213, 184,.8)",
        primary: "rgba(213, 185, 84,.8)",
        enphasis: "rgba(58, 41, 43, .8)",
        secondary: "rgba(0, 0, 0, .8)",
        txtbg: "rgba(0,170,250,.8)",
        txtbg1: "rgba(0,0,0,.6)",
      },
      boxShadow: {
        "3xl": [
          "0 0px 2px rgba(58,41,43,.8)",
          "0 0px 2px rgba(0,170,250,.8)",
        ],
      },
      dropShadow: {
        "4xl": [
          "0 0px 2px rgba(0,170,250,.8)",
          "0 0px 2px rgba(58, 41, 43,.8)",
        ],
        backgroundImage: {
          'custom-gradient': 'linear-gradient(to bottom, rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.9))',
        },
      },
    },
  },
  plugins: [animations],
};
