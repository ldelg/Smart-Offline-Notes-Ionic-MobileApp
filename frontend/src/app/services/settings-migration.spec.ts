import { resolveAutoTranslate, settingsNeedMigration } from './settings-migration';

describe('Whisper translate migration', () => {
  it('turns the old translate task into transcribe plus auto-translate to English', () => {
    expect(resolveAutoTranslate({ task: 'translate' })).toBe('en');
    expect(settingsNeedMigration({ task: 'translate' })).toBeTrue();
  });

  it('keeps an auto-translate choice that is already stored', () => {
    expect(resolveAutoTranslate({ task: 'translate', autoTranslateTo: 'de' })).toBe('de');
    expect(resolveAutoTranslate({ task: 'translate', autoTranslateTo: null })).toBeNull();
  });

  it('leaves normal settings and existing notes alone', () => {
    expect(resolveAutoTranslate({ task: 'transcribe' })).toBeNull();
    expect(resolveAutoTranslate({})).toBeNull();
    expect(settingsNeedMigration({})).toBeFalse();
    expect(settingsNeedMigration({ task: 'transcribe' })).toBeFalse();
  });
});