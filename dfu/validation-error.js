/* Keep package/transport validation language-neutral until the UI renders its message. */
(function (root) {
    class DfuValidationError extends Error {
        constructor(german, english) {
            super(german);
            this.english = english;
        }
    }
    if (typeof module === 'object' && module.exports) module.exports = DfuValidationError;
    else root.DfuValidationError = DfuValidationError;
})(globalThis);
