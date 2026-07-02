// Позволяет TypeScript понимать side-effect импорты стилей (import "./globals.css").
// Обработку CSS во время сборки берёт на себя Next.js/webpack — здесь только типы.
declare module "*.css";
declare module "*.scss";
