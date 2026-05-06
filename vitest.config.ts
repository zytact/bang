import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['src/__tests__/setup.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/main.ts'],
            exclude: ['src/bang.ts'],
            reporter: ['text', 'lcov'],
        },
    },
});
