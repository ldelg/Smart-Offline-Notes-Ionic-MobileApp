import { notePreview } from './note-preview';
import { filterNotes } from '../store/notes-list';
import { Note } from '../models/note.model';

describe('note list preview', () => {
  it('strips headings, emphasis, links, lists, and table markup', () => {
    const body = [
      '# Meeting notes',
      '',
      '**Hello** and *italic* with a [site](https://example.com) link.',
      '',
      '- First item',
      '1. Second item',
      '',
      '| Quarter | Region | Product | Units |',
      '| --- | --- | --- | --- |',
      '| Q1 | North | Widgets | 1200 |',
    ].join('\n');

    expect(notePreview(body)).toBe(
      [
        'Meeting notes',
        '',
        'Hello and italic with a site link.',
        '',
        'First item',
        'Second item',
        '',
        'Quarter · Region · Product · Units',
        'Q1 · North · Widgets · 1200',
      ].join('\n'),
    );
  });

  it('leaves a plain transcript unchanged', () => {
    const body = 'Hello world.\nThis is line two.\n\nNew paragraph after a pause.';
    expect(notePreview(body)).toBe(body);
  });

  it('keeps search on the original markdown', () => {
    const note: Note = {
      id: 'q3',
      title: 'Q3 workshop',
      body: '# Meeting notes\n\n**Hello** and *italic*',
      createdAt: 1,
      source: 'Upload',
      tags: ['import'],
    };
    expect(filterNotes([note], '**Hello**', null).map((item) => item.id)).toEqual(['q3']);
    expect(filterNotes([note], '# Meeting', null).map((item) => item.id)).toEqual(['q3']);
    expect(filterNotes([note], 'import', null).map((item) => item.id)).toEqual(['q3']);
    expect(notePreview(note.body)).not.toContain('#');
    expect(notePreview(note.body)).not.toContain('*');
  });
});