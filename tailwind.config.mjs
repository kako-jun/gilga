/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        gilga: {
          // 義賊の紫系。dark purple をブランド軸に置く（深紅は後で必要なら追加）
          purple: {
            300: '#d8b4fe',
            400: '#c084fc',
            500: '#a855f7',
            600: '#9333ea',
            700: '#7e22ce',
          },
        },
      },
    },
  },
  plugins: [],
};
