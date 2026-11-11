import { BERGAMOT_CACHE } from './bergamot-cache';
import { CatalogPack, catalogPack } from './translation-catalog';
import {
  downloadErrorKey,
  downloadPacks,
  fileProgress,
  listInstalledPacks,
  readCached,
  sha256Hex,
} from './translation-cache';

describe('translation download', () => {
  it('moves progress while bytes arrive and stays indeterminate without a length', () => {
    expect(fileProgress(0, 4, 0, 100)).toBe(0);
    expect(fileProgress(0, 4, 50, 100)).toBe(0.125);
    expect(fileProgress(1, 2, 10, 10)).toBe(1);
    expect(fileProgress(0, 2, 20, 0)).toBeNull();
  });

  it('turns a failed fetch into a readable error key', () => {
    expect(downloadErrorKey(new TypeError('Failed to fetch'))).toBe(
      'notes.translate.downloadFailed',
    );
    expect(
      downloadErrorKey(
        new Error(
          'Error downloading file: /data/user/0/io.ldelg.smartofflinenotes.debug/cache/file.bin: open failed: ENOENT',
        ),
      ),
    ).toBe('notes.translate.downloadFailed');
    expect(downloadErrorKey(new Error('Downloaded file did not match the Mozilla checksum'))).toBe(
      'notes.translate.checksumFailed',
    );
  });

  it('drops a partial pack when a later file fails', async () => {
    const pack = catalogPack('enit');
    expect(pack).toBeTruthy();
    const payload = new Uint8Array([1, 2, 3, 4]);
    const hash = await sha256Hex(payload);
    const fake: CatalogPack = {
      ...pack!,
      files: pack!.files.map((file) => ({ ...file, sha256: hash })),
    };
    await caches.delete(BERGAMOT_CACHE);
    localStorage.clear();
    const ratios: Array<number | null> = [];
    let calls = 0;
    await expectAsync(
      downloadPacks(
        [fake],
        false,
        (ratio) => ratios.push(ratio),
        async (_url, onFile) => {
          calls += 1;
          onFile(40, 100);
          if (calls > 1) throw new Error('Failed to fetch');
          onFile(100, 100);
          return payload;
        },
      ),
    ).toBeRejected();
    expect(calls).toBeGreaterThan(1);
    expect(ratios.some((ratio) => ratio !== null && ratio > 0)).toBeTrue();
    expect(await readCached('pack/enit/model')).toBeNull();
    expect((await listInstalledPacks()).some((item) => item.id === 'enit')).toBeFalse();
  });
});