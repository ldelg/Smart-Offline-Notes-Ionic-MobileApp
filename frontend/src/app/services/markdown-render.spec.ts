import { renderMarkdown } from './markdown-render';

describe('markdown rendering', () => {
  it('keeps plain transcript line breaks', () => {
    const html = renderMarkdown('Hello world.\nThis is line two.\n\nNew paragraph.');
    expect(html).toMatch(/Hello world\.<br\s*\/?>/);
    expect(html).toContain('This is line two.');
    expect(html).toContain('New paragraph.');
    expect(html.match(/<p>/g)?.length).toBe(2);
  });

  it('renders a table inside a horizontal scroller', () => {
    const html = renderMarkdown('| Name | Role |\n| --- | --- |\n| Ada | Engineer |');
    expect(html).toContain('class="table-scroll"');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>Ada</td>');
  });

  it('renders headings, lists, emphasis, and links', () => {
    const html = renderMarkdown('# Title\n\n- One\n- Two\n\nSee **bold** and *italic* and [site](https://example.com).');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<li>One</li>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('strips scripts and remote images', () => {
    const html = renderMarkdown(
      'Hello\n<script>alert(1)</script>\n<img src="https://example.com/a.png">\n\n![pic](https://example.com/b.png)',
    );
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html.toLowerCase()).not.toContain('<img');
    expect(html).not.toContain('example.com/a.png');
    expect(html).not.toContain('example.com/b.png');
    expect(html).toContain('Hello');
  });

  it('drops javascript links', () => {
    const html = renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).not.toMatch(/href=/);
  });
});
