import { describe, expect, it } from 'vitest';

import { BLOG_DIRECTORY, DIRECTORY_BLOGS, listedDirectory } from '@/services/blogs/directory';

describe('BLOG_DIRECTORY', () => {
  it('lists each feed once, over https', () => {
    const urls = DIRECTORY_BLOGS.map((b) => b.feedUrl);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of urls) expect(url.startsWith('https://')).toBe(true);
  });

  it('has unique section ids and no empty sections', () => {
    const ids = BLOG_DIRECTORY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of BLOG_DIRECTORY) expect(section.blogs.length).toBeGreaterThan(0);
  });

  it('writes its copy without em dashes', () => {
    for (const blog of DIRECTORY_BLOGS) {
      expect(blog.blurb).not.toContain('—');
      expect(blog.title).not.toContain('—');
    }
  });
});

describe('listedDirectory', () => {
  it('lists everything while no publisher has asked to be left out', () => {
    expect(listedDirectory(BLOG_DIRECTORY, [])).toEqual(BLOG_DIRECTORY);
    expect(listedDirectory(BLOG_DIRECTORY, [{ host: 'aeon.co', cloud: false }])).toEqual(BLOG_DIRECTORY);
  });

  it('leaves out a blog that asked, and a section it empties', () => {
    const sections = [
      { id: 'a', label: 'A', blogs: [{ title: 'Aeon', feedUrl: 'https://aeon.co/feed.rss', blurb: 'x' }] },
      { id: 'b', label: 'B', blogs: [{ title: 'FS', feedUrl: 'https://fs.blog/feed/', blurb: 'y' }] },
    ];
    expect(listedDirectory(sections, [{ host: 'aeon.co', explore: false }]).map((s) => s.id)).toEqual(['b']);
  });
});
