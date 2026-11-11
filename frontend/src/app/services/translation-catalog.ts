import { AppLang } from '../models/translation.model';

/**
 * Firefox Translations models (Remote Settings collection translations-models-v2,
 * architecture base-memory, version 3.0) and the Bergamot WASM engine
 * (translations-wasm version 3.0, release v0.6.0). Files are downloaded from
 * Mozilla's attachment CDN. They are not re-hosted in this repository.
 * Captured 11 Nov 2026. Attachment paths are content-addressed.
 */
export const MOZILLA_CDN = 'https://firefox-settings-attachments.cdn.mozilla.net/';

export const BERGAMOT_WASM = {
  version: '3.0',
  release: 'v0.6.0',
  bytes: 4960506,
  sha256: 'a3a89d9ad0a4ed8f27bf3e403701b23f5709816f6376438503f2fa5b0182c2dc',
  url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-wasm/05082c31-aee8-4249-9e01-c1865afd7520.wasm',
};

export interface CatalogFile {
  fileType: 'model' | 'lex' | 'vocab';
  name: string;
  bytes: number;
  sha256: string;
  url: string;
}

export interface CatalogPack {
  id: string;
  src: AppLang;
  tgt: AppLang;
  bytes: number;
  files: CatalogFile[];
}

export const LANGUAGE_PACKS: readonly CatalogPack[] = [
  {
    id: 'deen',
    src: 'de',
    tgt: 'en',
    bytes: 37317656,
    files: [
    { fileType: 'model', name: 'model.deen.intgemm.alphas.bin', bytes: 31561787, sha256: '3e6f7c2c2425d10824797270b382bee718ff34af2cab9308841c82ca46dc6f20', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/172680a0-ffd1-4c00-8b35-216898c4f462.zst' },
    { fileType: 'lex', name: 'lex.50.50.deen.s2t.bin', bytes: 4945796, sha256: '113b98460468360cca68c042e1cddf49c4e1931cbb975ed04349c9a3bd607010', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/87ba9213-f69e-4e31-9251-aa2e297d1f26.zst' },
    { fileType: 'vocab', name: 'vocab.deen.spm', bytes: 810073, sha256: '69f730becafa48e3bb2c244eab66456877c08959a02f2bd5519b5a3088b62f9c', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/3187809f-ec68-4da1-8149-f9c4b0f36644.zst' },
    ],
  },
  {
    id: 'ende',
    src: 'en',
    tgt: 'de',
    bytes: 36719532,
    files: [
    { fileType: 'model', name: 'model.ende.intgemm.alphas.bin', bytes: 31561787, sha256: '8df29d9494d19f47fd5d97c6a73474c6f657e9f81c1a607c431d02befdf3810f', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/210d5dea-12cc-4960-9f6a-aa21740c6735.zst' },
    { fileType: 'lex', name: 'lex.50.50.ende.s2t.bin', bytes: 4347672, sha256: '7ed39f1cffbd68a27ddf05bbfe068de2060f1d7e69f1a20e27ae923551dd7393', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/7b8929f7-c5c2-4869-9193-12821a86354d.zst' },
    { fileType: 'vocab', name: 'vocab.ende.spm', bytes: 810073, sha256: '69f730becafa48e3bb2c244eab66456877c08959a02f2bd5519b5a3088b62f9c', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/a850d21e-c220-45ea-b978-a826a9248e64.zst' },
    ],
  },
  {
    id: 'enes',
    src: 'en',
    tgt: 'es',
    bytes: 36576277,
    files: [
    { fileType: 'model', name: 'model.enes.intgemm.alphas.bin', bytes: 31561787, sha256: '3b1c399511c01c84c36fae5c0524df44096288efdc8236e182b5c97d7ad2244c', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/1d705201-9be0-40c4-a0b4-18d1e3973777.zst' },
    { fileType: 'lex', name: 'lex.50.50.enes.s2t.bin', bytes: 4198436, sha256: '7d51237c0a07027dcd61643cfbbb0f8c48597d19907ef53d2cae9d6bec2cf25c', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/51318160-1249-451f-80fb-12e61f8c1def.zst' },
    { fileType: 'vocab', name: 'vocab.enes.spm', bytes: 816054, sha256: '5ae254fa9b15aa182e70fd2a6186b1333c63a29a48043a9224c6aa4fcac058ad', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/b2b5907b-8759-4cc8-a721-89c283e6e45b.zst' },
    ],
  },
  {
    id: 'enfr',
    src: 'en',
    tgt: 'fr',
    bytes: 36749127,
    files: [
    { fileType: 'model', name: 'model.enfr.intgemm.alphas.bin', bytes: 31561787, sha256: '6322e296d4fecfe395a8d5723da4ec37ecbe6d7613bb1dfcf4b28e2a47498b68', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/570d07a3-d360-430f-bbb4-37d89715bcfb.zst' },
    { fileType: 'lex', name: 'lex.50.50.enfr.s2t.bin', bytes: 4372936, sha256: '2585ed98d3af0bc949865aedeb390493d591f56870814376e73e4144c41ed059', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/bff0d10a-d07a-4873-a5a7-a6b7af42bf86.zst' },
    { fileType: 'vocab', name: 'vocab.enfr.spm', bytes: 814404, sha256: '783abf3abe075afdf8d85d233994bef2c3a064e935ab1bed946820aff6ac002a', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/faa168f7-1b8d-4d29-9267-cc5e1bac3c73.zst' },
    ],
  },
  {
    id: 'enit',
    src: 'en',
    tgt: 'it',
    bytes: 36507703,
    files: [
    { fileType: 'model', name: 'model.enit.intgemm.alphas.bin', bytes: 31561787, sha256: '248f47568788ecc351da7e5e07064d4153b4f71e011364ae2c931ffeec4d1cc2', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/3869680e-cedc-4af2-9167-bee368caa4be.zst' },
    { fileType: 'lex', name: 'lex.50.50.enit.s2t.bin', bytes: 4133192, sha256: '8b21914804625b2777dae7fdb636eb78f02a3eb8b7bceaa50f29ac740961da93', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/598d567f-4a7e-4ae8-b9b2-0c4edbc01aa6.zst' },
    { fileType: 'vocab', name: 'vocab.enit.spm', bytes: 812724, sha256: '3ef0211d4ae6db21440892f180f2019fe2bfc110a330ffa9d2eca9665e4f2bc5', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/6779446e-354e-44ec-a0d1-f3435c340b86.zst' },
    ],
  },
  {
    id: 'esen',
    src: 'es',
    tgt: 'en',
    bytes: 37014089,
    files: [
    { fileType: 'model', name: 'model.esen.intgemm.alphas.bin', bytes: 31561787, sha256: '4aed7734152ae0045d1a69ae49c86cfda18f53c61f90e95e1d1de1c7c7c3b033', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/fccccf6a-6d29-407d-82a5-0cf73b23d892.zst' },
    { fileType: 'lex', name: 'lex.50.50.esen.s2t.bin', bytes: 4636248, sha256: 'e2610211d3b9577d012638fe7e7e74ed7b4b708ce96b9e792e67c282a6492daa', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/64f16997-3cf3-4cc8-a069-b143760b1173.zst' },
    { fileType: 'vocab', name: 'vocab.esen.spm', bytes: 816054, sha256: '5ae254fa9b15aa182e70fd2a6186b1333c63a29a48043a9224c6aa4fcac058ad', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/2239f64b-dfc4-41c1-9e06-d532dce7b246.zst' },
    ],
  },
  {
    id: 'fren',
    src: 'fr',
    tgt: 'en',
    bytes: 37200311,
    files: [
    { fileType: 'model', name: 'model.fren.intgemm.alphas.bin', bytes: 31561787, sha256: '15f997bc0d13808b0b0fbd0786e684a3c8a52adcd8071844b76123fdacbf2b90', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/3a84a714-bfc7-4e52-81a1-b08d5d9421d2.zst' },
    { fileType: 'lex', name: 'lex.50.50.fren.s2t.bin', bytes: 4824120, sha256: '87c6752ea908f5f0347c10ac0cf7d80d9c2f4f20c81c90168f3e8230b56d4440', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/7238348a-b118-40f8-9e17-327fb54b2dc8.zst' },
    { fileType: 'vocab', name: 'vocab.fren.spm', bytes: 814404, sha256: '783abf3abe075afdf8d85d233994bef2c3a064e935ab1bed946820aff6ac002a', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/671f09a0-12a2-436e-94d8-2575a4594c2a.zst' },
    ],
  },
  {
    id: 'iten',
    src: 'it',
    tgt: 'en',
    bytes: 37088127,
    files: [
    { fileType: 'model', name: 'model.iten.intgemm.alphas.bin', bytes: 31561787, sha256: '21b70978ce2f3b4da7a06b5de86a09abe3acd30b9eee1b2ebb3582b9bad790bf', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/24527d9a-7ab8-40e3-a240-f894e0244371.zst' },
    { fileType: 'lex', name: 'lex.50.50.iten.s2t.bin', bytes: 4713616, sha256: '0700d6d70b30490e68ff9deca0b45b80310745b491855bde3a13e1692d0cbce1', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/6a146710-1ffc-415e-995e-18588e56f40d.zst' },
    { fileType: 'vocab', name: 'vocab.iten.spm', bytes: 812724, sha256: '3ef0211d4ae6db21440892f180f2019fe2bfc110a330ffa9d2eca9665e4f2bc5', url: 'https://firefox-settings-attachments.cdn.mozilla.net/main-workspace/translations-models-v2/352a4445-9c4b-43df-a292-c76cb040f428.zst' },
    ],
  },
];

export function catalogPack(id: string): CatalogPack | undefined {
  return LANGUAGE_PACKS.find((pack) => pack.id === id);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}
