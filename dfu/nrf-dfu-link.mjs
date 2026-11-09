// Hand off the published application ZIP. Local files and device references stay in the browser.
export function nrfDfuLink(entry) {
    const release = /^2\.22\.0-DE3\.([1-9]\d{0,3})$/.exec(entry?.version);
    if (!release || entry.board !== 'LCD' || entry.applicationOnly !== true ||
        entry.id !== `de3.${release[1]}-lcd-app` ||
        !Number.isSafeInteger(entry.counter) || entry.counter < 1 || entry.counter > 0xffffffff) return null;

    const filename = `Allmiibo_LCD_DE3_${release[1]}_${entry.counter}_NUR_APP.zip`;
    if (entry.file !== filename) return null;
    const published = 'https://bluecyber81.github.io/pixl.js/firmware/' + filename;
    return 'https://www.nordicsemi.com/dfu/?' + new URLSearchParams({file: published});
}
