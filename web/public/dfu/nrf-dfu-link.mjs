// Hand off the published application ZIP. Local files and device references stay in the browser.
export function nrfDfuLink(entry) {
    if (entry?.board === 'OLED') {
        const oled = /^2\.22\.0-DE3\.([1-9]\d{0,3})-OLEDt([1-9]\d{0,2})$/.exec(entry.version);
        if (!oled || entry.applicationOnly !== true || entry.channel !== 'prerelease' ||
            entry.id !== `de3.${oled[1]}-oled-t${oled[2]}-app` ||
            entry.file !== `Allmiibo_OLED_DE3_${oled[1]}_Test${oled[2]}_APP.zip` ||
            entry.softDevice !== 'S112 7.2.0' || !Number.isSafeInteger(entry.counter) ||
            entry.counter < 1 || entry.counter > 0xffffffff) return null;
        return 'https://www.nordicsemi.com/dfu/?' + new URLSearchParams({
            file: 'https://github.com/bluecyber81/pixl.js/releases/download/de3.' + oled[1] + '-oled-t' + oled[2] + '/' + entry.file
        });
    }
    if (entry?.version === '2.22.0-DE3.103' || entry?.id === 'de3.103-lcd-app-test1') {
        if (entry.version !== '2.22.0-DE3.103' || entry.id !== 'de3.103-lcd-app-test1' ||
            entry.board !== 'LCD' || entry.counter !== 676 || entry.channel !== 'prerelease' ||
            entry.applicationOnly !== true || entry.migrationRequired !== false || entry.storage !== 'PFS1' ||
            entry.bootloader !== 'Z21' || entry.softDevice !== 'S112 7.3.0' ||
            entry.file !== 'Allmiibo_LCD_DE3_103_676_NUR_APP.zip') return null;
        return 'https://www.nordicsemi.com/dfu/?' + new URLSearchParams({
            file: 'https://bluecyber81.github.io/pixl.js/firmware/' + entry.file
        });
    }
    // Normal releases use exact profiles at the normal Pages root. Retained
    // App671 links remain valid and cannot alias the newer application.
    const normal = [
        {id:'de3.98-lcd-app',version:'2.22.0-DE3.98',counter:671,file:'Allmiibo_LCD_DE3_98_671_NUR_APP.zip'},
        {id:'de3.99-lcd-app',version:'2.22.0-DE3.99',counter:672,file:'Allmiibo_LCD_DE3_99_672_NUR_APP.zip'},
        {id:'de3.100-lcd-app',version:'2.22.0-DE3.100',counter:673,file:'Allmiibo_LCD_DE3_100_673_NUR_APP.zip'},
        {id:'de3.102-lcd-app',version:'2.22.0-DE3.102',counter:675,file:'Allmiibo_LCD_DE3_102_675_NUR_APP.zip'},
        {id:'de3.101-lcd-app',version:'2.22.0-DE3.101',counter:674,file:'Allmiibo_LCD_DE3_101_674_NUR_APP.zip'}
    ].find(profile => entry?.id === profile.id || entry?.version === profile.version);
    if (normal) {
        if (entry.board !== 'LCD' || entry.id !== normal.id || entry.version !== normal.version ||
            entry.counter !== normal.counter || entry.channel || entry.applicationOnly !== true || entry.migrationRequired !== false ||
            entry.storage !== 'PFS1' || entry.bootloader !== 'Z21' || entry.softDevice !== 'S112 7.3.0' ||
            entry.file !== normal.file) return null;
        return 'https://www.nordicsemi.com/dfu/?' + new URLSearchParams({
            file: 'https://bluecyber81.github.io/pixl.js/firmware/' + entry.file
        });
    }
    // This isolated test distribution is intentionally not at the normal
    // Pages root. Keep its native-app handoff bound to the exact test target.
    const lcdTest = entry?.id === 'de3.96-lcd-app-test1' ? {minor:96,counter:669}
        : entry?.id === 'de3.97-lcd-app-test1' ? {minor:97,counter:670} : null;
    if (lcdTest) {
        if (entry.board !== 'LCD' || entry.version !== `2.22.0-DE3.${lcdTest.minor}` || entry.counter !== lcdTest.counter ||
            entry.channel !== 'prerelease' || entry.applicationOnly !== true || entry.migrationRequired !== false ||
            entry.storage !== 'PFS1' || entry.bootloader !== 'Z21' || entry.softDevice !== 'S112 7.3.0' ||
            entry.file !== `Allmiibo_LCD_DE3_${lcdTest.minor}_${lcdTest.counter}_TEST1_NUR_APP.zip`) return null;
        return 'https://www.nordicsemi.com/dfu/?' + new URLSearchParams({
            file: `https://bluecyber81.github.io/pixl.js/test/app${lcdTest.counter}/firmware/` + entry.file
        });
    }
    if (entry?.version === '2.22.0-DE3.97') return null; // No normal-root App670 alias.
    const release = /^2\.22\.0-DE3\.([1-9]\d{0,3}(?:t[1-9]\d{0,2})?)$/.exec(entry?.version);
    if (!release || release[1] === '86') return null; // App659 has no public Android offering.
    const trialCounter = { '84': 657, '85': 658, '87': 660, '88': 661 }[release[1]];
    if (release[1] === '89' && (entry.channel || entry.counter !== 662 || entry.bootloader !== 'Z21' || entry.softDevice !== 'S112 7.3.0')) return null;
    const expectedId = trialCounter ? `de3.${release[1]}-lcd-test1-app` : `de3.${release[1]}-lcd-app`;
    if (trialCounter && (entry.channel !== 'prerelease' || entry.counter !== trialCounter ||
        entry.bootloader !== 'Z21' || entry.softDevice !== 'S112 7.3.0')) return null;
    if (entry.board !== 'LCD' || entry.applicationOnly !== true ||
        entry.id !== expectedId ||
        !Number.isSafeInteger(entry.counter) || entry.counter < 1 || entry.counter > 0xffffffff) return null;

    const testBuild = release[1].includes('t');
    if (testBuild && entry.channel !== 'prerelease') return null;
    const filename = testBuild
        ? `Allmiibo_DE3_${release[1]}_App${entry.counter}_NUR_APP_SIGNIERT.zip`
        : `Allmiibo_LCD_DE3_${release[1]}_${entry.counter}_NUR_APP.zip`;
    const reviewFile = `Allmiibo_LCD_DE3_${release[1]}_App${entry.counter}_TEST_DFU.zip`;
    if (entry.file !== filename && !(entry.channel === 'prerelease' && !trialCounter && !testBuild && entry.file === reviewFile)) return null;
    const published = (release[1] === '89' ? 'https://github.com/bluecyber81/pixl.js/releases/download/de3.89/' : release[1] === '88'
        ? 'https://github.com/bluecyber81/pixl.js/releases/download/de3.' + release[1] + '-lcd-test1/'
        : 'https://bluecyber81.github.io/pixl.js/firmware/') + entry.file;
    return 'https://www.nordicsemi.com/dfu/?' + new URLSearchParams({file: published});
}
