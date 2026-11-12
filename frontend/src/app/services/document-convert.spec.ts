import { csvToMarkdown, docxToMarkdown, plainTextBody } from './document-convert';
import { importKind, prepareImportFile, prepareSharedText } from './document-import';

describe('document converters', () => {
  const options = { fallbackTitle: 'Imported note' };

  it('keeps txt and md text as written', async () => {
    const txt = await prepareImportFile(
      { name: 'Grocery list.txt', mime: 'text/plain', text: 'Milk\r\nEggs\r\n' },
      options,
    );
    expect(txt.note?.title).toBe('Grocery list');
    expect(txt.note?.body).toBe('Milk\nEggs\n');
    expect(txt.note?.source).toBe('Upload');

    const md = await prepareImportFile(
      { name: 'Plan.md', mime: 'text/plain', text: '# Plan\n\n- One\n' },
      options,
    );
    expect(md.note?.title).toBe('Plan');
    expect(md.note?.body).toBe('# Plan\n\n- One\n');
  });

  it('turns comma, semicolon, and tab csv into tables and keeps quotes', () => {
    expect(csvToMarkdown('Name,Note\n"Doe, Jane","She said ""hi"""').markdown).toBe(
      '| Name | Note |\n| --- | --- |\n| Doe, Jane | She said "hi" |',
    );
    expect(csvToMarkdown('A;B\n1;2').markdown).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(csvToMarkdown('A\tB\n1\t2').markdown).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });

  it('keeps the header plus 300 data rows and leaves the notice off the note text', async () => {
    const lines = ['Item,Qty'];
    for (let i = 1; i <= 301; i++) lines.push(`Row ${i},${i}`);
    const table = csvToMarkdown(lines.join('\n'));
    expect(table.truncatedRows).toBeTrue();
    expect(table.shownDataRows).toBe(300);
    expect(table.totalDataRows).toBe(301);
    expect(table.markdown).toContain('| Item | Qty |');
    expect(table.markdown).toContain('| Row 300 | 300 |');
    expect(table.markdown).not.toContain('Row 301');

    const prepared = await prepareImportFile(
      { name: 'big.csv', mime: 'text/csv', text: lines.join('\n') },
      options,
    );
    expect(prepared.note?.body).not.toContain('Showing the first');
    expect(prepared.note?.csvLimit).toEqual({ shown: 300, total: 301 });
  });

  it('keeps every data row when the sheet has 300 or fewer', () => {
    const lines = ['Item,Qty'];
    for (let i = 1; i <= 300; i++) lines.push(`Row ${i},${i}`);
    const table = csvToMarkdown(lines.join('\n'));
    expect(table.truncatedRows).toBeFalse();
    expect(table.shownDataRows).toBe(300);
    expect(table.totalDataRows).toBe(300);
  });

  it('keeps the first 50 columns', () => {
    const header = Array.from({ length: 51 }, (_, index) => `C${index + 1}`).join(',');
    const values = Array.from({ length: 51 }, (_, index) => String(index + 1)).join(',');
    const table = csvToMarkdown(`${header}\n${values}`);
    expect(table.truncatedCols).toBeTrue();
    expect(table.shownCols).toBe(50);
    expect(table.widestRow).toBe(51);
    expect(table.markdown).toContain('C50');
    expect(table.markdown).not.toContain('C51');
  });

  it('imports a multi-megabyte csv without keeping every row', () => {
    const lines = ['A,B'];
    const cell = 'x'.repeat(64);
    let bytes = 3;
    let count = 0;
    while (bytes < 2 * 1024 * 1024) {
      count += 1;
      const line = `${count},${cell}`;
      lines.push(line);
      bytes += line.length + 1;
    }
    const started = performance.now();
    const table = csvToMarkdown(lines.join('\n'));
    expect(performance.now() - started).toBeLessThan(8000);
    expect(table.shownDataRows).toBe(300);
    expect(table.totalDataRows).toBe(count);
    expect(table.markdown.length).toBeLessThan(200_000);
  });

  it('converts a docx with headings, lists, emphasis, and a table, and drops images', async () => {
    const markdown = await docxToMarkdown(sampleDocx());
    expect(markdown).toContain('# Meeting notes');
    expect(markdown).toContain('**Bold**');
    expect(markdown).toContain('*italic*');
    expect(markdown).toContain('- First item');
    expect(markdown).toContain('- Second item');
    expect(markdown).toContain('| Name | Role |');
    expect(markdown).toContain('| Ada | Engineer |');
    expect(markdown.toLowerCase()).not.toContain('<img');
    expect(markdown).not.toContain('pixel.png');
    expect(markdown).not.toContain('](data:');
  });

  it('rejects legacy doc, unknown types, empty files, and text that is too large', async () => {
    expect(importKind('notes.md', 'application/octet-stream')).toBe('md');
    expect(importKind('data.csv', 'text/plain')).toBe('csv');
    expect(importKind('page.txt', 'text/markdown')).toBe('txt');
    expect(
      (
        await prepareImportFile(
          { name: 'old.doc', mime: 'application/msword', base64: 'AA==' },
          options,
        )
      ).error,
    ).toBe('legacy-doc');
    expect(
      (
        await prepareImportFile(
          { name: 'scan.pdf', mime: 'application/pdf', text: 'hello' },
          options,
        )
      ).error,
    ).toBe('unsupported');
    expect(
      (
        await prepareImportFile(
          { name: 'empty.txt', mime: 'text/plain', text: ' \n' },
          options,
        )
      ).error,
    ).toBe('empty');
    expect(
      (
        await prepareImportFile(
          { name: 'huge.txt', mime: 'text/plain', text: 'a'.repeat(1_000_001) },
          options,
        )
      ).error,
    ).toBe('too-large');
    expect(plainTextBody('\uFEFFhello')).toBe('hello');
  });

  it('uses the subject or the first heading for shared text', () => {
    const withSubject = prepareSharedText('Hello\nthere', 'From Ada', 'Shared text');
    expect(withSubject.note).toEqual({
      title: 'From Ada',
      body: 'Hello\nthere',
      source: 'Typed',
    });
    const heading = prepareSharedText('# Shopping\n\nMilk', undefined, 'Shared text');
    expect(heading.note?.title).toBe('Shopping');
    expect(heading.note?.body).toContain('# Shopping');
  });
});

function sampleDocx(): ArrayBuffer {
  const files: { name: string; data: Uint8Array }[] = [
    { name: '[Content_Types].xml', data: text(CONTENT_TYPES) },
    { name: '_rels/.rels', data: text(ROOT_RELS) },
    { name: 'word/document.xml', data: text(DOCUMENT) },
    { name: 'word/styles.xml', data: text(STYLES) },
    { name: 'word/numbering.xml', data: text(NUMBERING) },
    { name: 'word/_rels/document.xml.rels', data: text(DOCUMENT_RELS) },
    { name: 'word/media/pixel.png', data: PIXEL_PNG },
  ];
  const zipped = storeZip(files);
  const copy = new ArrayBuffer(zipped.byteLength);
  new Uint8Array(copy).set(zipped);
  return copy;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pixel.png"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
  </w:style>
</w:styles>`;

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Meeting notes</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r>
      <w:r><w:t xml:space="preserve"> and </w:t></w:r>
      <w:r><w:rPr><w:i/></w:rPr><w:t>italic</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>First item</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
      <w:r><w:t>Second item</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Role</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Ada</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Engineer</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:blipFill>
                    <a:blip r:embed="rId3"/>
                  </pic:blipFill>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;

const PIXEL_PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84, 120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 45,
  180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function storeZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const time = 0;
  const date = 33;
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ]);
    const record = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    parts.push(local);
    central.push(record);
    offset += local.length;
  }
  const directory = concat(central);
  parts.push(directory);
  parts.push(
    concat([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(files.length),
      u16(files.length),
      u32(directory.length),
      u32(offset),
      u16(0),
    ]),
  );
  return concat(parts);
}

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
