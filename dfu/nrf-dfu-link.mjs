// Hand off the published application ZIP. Local files and device references stay in the browser.
export function nrfDfuLink(entry) {
    const release = /^2\.22\.0-DE3\.([1-9]\d{0,3}(?:t[1-9]\d{0,2})?)$/.exec(entry?.version);
    if (!release || entry.board !== 'LCD' || entry.applicationOnly !== true ||
        entry.id !== `de3.${release[1]}-lcd-app` ||
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
