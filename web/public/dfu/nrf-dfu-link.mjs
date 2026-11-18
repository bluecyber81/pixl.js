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
            file: 'https://bluecyber81.github.io/pixl.js/firmware/' + entry.file
        });
    }
    const release = /^2\.22\.0-DE3\.([1-9]\d{0,3}(?:t[1-9]\d{0,2})?)$/.exec(entry?.version);
    const test657 = release?.[1] === '84' && entry.channel === 'prerelease' && entry.counter === 657 && entry.bootloader === 'Z21';
    const test658 = release?.[1] === '85' && entry.channel === 'prerelease' && entry.counter === 658 && entry.bootloader === 'Z21';
    const expectedId = test657 ? 'de3.84-lcd-test1-app' : test658 ? 'de3.85-lcd-test1-app' : release && `de3.${release[1]}-lcd-app`;
    if (!release || entry.board !== 'LCD' || entry.applicationOnly !== true ||
        entry.id !== expectedId ||
        !Number.isSafeInteger(entry.counter) || entry.counter < 1 || entry.counter > 0xffffffff) return null;

    const testBuild = release[1].includes('t');
    if (testBuild && entry.channel !== 'prerelease') return null;
    const filename = testBuild
        ? `Allmiibo_DE3_${release[1]}_App${entry.counter}_NUR_APP_SIGNIERT.zip`
        : `Allmiibo_LCD_DE3_${release[1]}_${entry.counter}_NUR_APP.zip`;
    const reviewFile = `Allmiibo_LCD_DE3_${release[1]}_App${entry.counter}_TEST_DFU.zip`;
    if (entry.file !== filename && !(entry.channel === 'prerelease' && !testBuild && entry.file === reviewFile)) return null;
    const published = 'https://bluecyber81.github.io/pixl.js/firmware/' + entry.file;
    return 'https://www.nordicsemi.com/dfu/?' + new URLSearchParams({file: published});
}
