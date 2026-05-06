import { describe, it, expect, afterEach } from 'vitest';
import { seedBangMap, getBangredirectUrl, doRedirect } from '../main';

function setQuery(q: string) {
    window.location.href = `http://localhost/?q=${encodeURIComponent(q)}`;
}

describe('seedBangMap', () => {
    it('seeds bang-map in localStorage when absent', () => {
        seedBangMap();
        const raw = localStorage.getItem('bang-map');
        expect(raw).not.toBeNull();
        const map = JSON.parse(raw!);
        expect(map['g']).toContain('google.com');
    });

    it('is a no-op when bang-map already exists', () => {
        localStorage.setItem('bang-map', JSON.stringify({ fake: 'stub' }));
        seedBangMap();
        const map = JSON.parse(localStorage.getItem('bang-map')!);
        expect(map['fake']).toBe('stub');
        expect(map['g']).toBeUndefined();
    });
});

describe('getBangredirectUrl', () => {
    it('returns null when no ?q= param', () => {
        expect(getBangredirectUrl()).toBeNull();
    });

    it('returns null for empty ?q= param', () => {
        setQuery('');
        expect(getBangredirectUrl()).toBeNull();
    });

    it('redirects to Google for !g bang', () => {
        setQuery('!g hello world');
        const url = getBangredirectUrl();
        expect(url).toContain('google.com');
        expect(url).toContain('hello%20world');
    });

    it('strips bang from the query string', () => {
        setQuery('!g foo bar');
        const url = getBangredirectUrl()!;
        expect(url).not.toContain('!g');
        expect(url).toContain('foo%20bar');
    });

    it('handles bang with no search terms', () => {
        setQuery('!g');
        const url = getBangredirectUrl()!;
        expect(url).toContain('google.com');
        expect(url).toContain('q=');
    });

    it('falls back to default bang for unknown tag', () => {
        setQuery('!zzz_nonexistent foobar');
        const url = getBangredirectUrl()!;
        expect(url).toContain('google.com');
        expect(url).toContain('foobar');
    });

    describe('custom default-bang', () => {
        afterEach(() => {
            localStorage.removeItem('default-bang');
        });

        it('respects custom default-bang in localStorage', () => {
            localStorage.setItem('default-bang', 'ddg');
            setQuery('!zzz_nonexistent foobar');
            const url = getBangredirectUrl()!;
            expect(url).toContain('duckduckgo.com');
        });
    });

    it('converts %2F back to / for path-style queries', () => {
        setQuery('!ghr t3dotgg/unduck');
        const url = getBangredirectUrl()!;
        expect(url).toContain('t3dotgg/unduck');
        expect(url).not.toContain('%2F');
    });

    it('is case-insensitive for bang tag matching', () => {
        setQuery('!G hello');
        const url = getBangredirectUrl()!;
        expect(url).toContain('google.com');
    });
});

describe('doRedirect', () => {
    it('calls window.location.replace with the resolved URL', () => {
        setQuery('!g hello');
        doRedirect();
        expect(window.location.replace).toHaveBeenCalledOnce();
        expect(window.location.replace).toHaveBeenCalledWith(
            expect.stringContaining('google.com')
        );
    });

    it('does not call replace when there is no query', () => {
        doRedirect();
        expect(window.location.replace).not.toHaveBeenCalled();
    });
});
