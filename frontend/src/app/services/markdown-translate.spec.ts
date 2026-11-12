import {
  hasInlineMarkdown,
  markdownHasStructure,
  translateMarkdown,
  translateNoteBody,
} from './markdown-translate';

describe('markdown translation structure', () => {
  const prefix = async (text: string) =>
    text
      .split('\n')
      .map((line) => (line.trim() ? `~${line}` : line))
      .join('\n');

  it('leaves plain transcripts on the normal translator', async () => {
    const transcript = 'Hello world.\nThis is line two.\n\nNew paragraph.';
    expect(markdownHasStructure(transcript)).toBeFalse();
    const calls: string[] = [];
    const machine = {
      translate: async (text: string) => {
        calls.push(text);
        return text;
      },
    };
    const result = await translateNoteBody(machine, transcript, 'en', 'it', 'note');
    expect(result).toBe(transcript);
    expect(calls).toEqual([transcript]);
  });

  it('translates headings, lists, table cells, and quotes without moving the marks', async () => {
    const source = ['# Hello', '', '- One', '- Two', '', '| A | B |', '| --- | --- |', '| 1 | 2 |', '', '> Note'].join(
      '\n',
    );
    const result = await translateMarkdown(source, {
      plain: prefix,
      html: async (html) => html,
    });
    expect(result).toContain('# ~Hello');
    expect(result).toContain('- ~One');
    expect(result).toContain('- ~Two');
    expect(result).toContain('| ~A | ~B |');
    expect(result).toContain('| --- | --- |');
    expect(result).toContain('| ~1 | ~2 |');
    expect(result).toContain('> ~Note');
  });

  it('keeps fenced code and inline emphasis', async () => {
    const source = ['See **Alpha** and `code`.', '', '```', 'Alpha', '```'].join('\n');
    expect(hasInlineMarkdown('See **Alpha**')).toBeTrue();
    const result = await translateMarkdown(source, {
      plain: prefix,
      html: async (html) => html.replace(/Alpha/g, 'Beta'),
    });
    expect(result).toContain('**Beta**');
    expect(result).toContain('`code`');
    expect(result).toContain('```\nAlpha\n```');
  });

  it('passes a plain paragraph inside a structured note through with its line break', async () => {
    const calls: string[] = [];
    const result = await translateMarkdown('# Title\n\nHello\nthere', {
      plain: async (text) => {
        calls.push(text);
        return text;
      },
      html: async (html) => html,
    });
    expect(calls).toContain('Hello\nthere');
    expect(result).toContain('# Title');
    expect(result).toContain('Hello\nthere');
  });
});
