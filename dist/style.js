"use strict";
const HEX64_RE = /^[0-9a-f]{64}$/;
function deriveStyle(styleSeedHex) {
    if (!HEX64_RE.test(styleSeedHex))
        return null;
    const headerColour = `#${styleSeedHex.slice(0, 6)}`;
    const glitchPalette = [
        `#${styleSeedHex.slice(0, 6)}`,
        `#${styleSeedHex.slice(6, 12)}`,
        `#${styleSeedHex.slice(12, 18)}`,
        `#${styleSeedHex.slice(18, 24)}`,
    ];
    const avatarSeed = styleSeedHex.slice(0, 16);
    const avatar = generateAvatarSvg(avatarSeed, headerColour);
    const bgPattern = styleSeedHex.charCodeAt(0) % 4;
    return { headerColour, glitchPalette, avatar, bgPattern };
}
function generateAvatarSvg(seed, color) {
    const cells = [];
    for (let i = 0; i < 15; i++) {
        cells.push(parseInt(seed[i], 16) > 7 ? 1 : 0);
    }
    let rects = '';
    for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 3; x++) {
            if (cells[y * 3 + x]) {
                rects += `<rect x="${x * 10}" y="${y * 10}" width="10" height="10" fill="${color}"/>`;
                if (x < 2) {
                    rects += `<rect x="${(4 - x) * 10}" y="${y * 10}" width="10" height="10" fill="${color}"/>`;
                }
            }
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="50" height="50">${rects}</svg>`;
}
//# sourceMappingURL=style.js.map