import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Home from './page';
vi.mock('@/components/landing/hero-scrub-video', () => ({ HeroScrubVideo: () => null }));
describe('public landing language and production entry points', () => {
  it('opens in English without an existing locale preference', async () => {
    const html=renderToStaticMarkup(await Home({searchParams:Promise.resolve({})}));
    expect(html).toContain('Know what buyers mean');
    expect(html).toContain('Deployment guide');
    expect(html).toContain('/login?lang=en');
    expect(html).not.toContain('demo=true');
    expect(html).not.toContain('/demo-login');
  });
  it('retains an explicit Chinese option', async () => {
    const html=renderToStaticMarkup(await Home({searchParams:Promise.resolve({lang:'zh'})}));
    expect(html).toContain('自部署指南');
    expect(html).toContain('/?lang=en');
    expect(html).not.toContain('demo=true');
  });
});
