import { vi, beforeEach } from 'vitest';

// Provide #app so the module-level doRedirect() call doesn't throw
// when it falls through to noSearchDefaultPageRender on import
document.body.innerHTML = '<div id="app"></div>';

Object.defineProperty(window, 'location', {
    value: {
        href: 'http://localhost/',
        replace: vi.fn(),
    },
    writable: true,
});

beforeEach(() => {
    localStorage.clear();
    window.location.href = 'http://localhost/';
    vi.mocked(window.location.replace).mockClear();
});
