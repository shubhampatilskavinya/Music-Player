module.exports = [
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("path", () => require("path"));

module.exports = mod;
}),
"[project]/app/api/search/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
function plainText(value) {
    return value?.simpleText ?? value?.runs?.map((part)=>part.text ?? "").join("") ?? "";
}
function collectVideos(value, results) {
    if (Array.isArray(value)) {
        for (const item of value)collectVideos(item, results);
        return;
    }
    if (!value || typeof value !== "object") return;
    const record = value;
    if (record.videoRenderer && typeof record.videoRenderer === "object") {
        const video = record.videoRenderer;
        const videoId = video.videoId;
        if (typeof videoId === "string" && /^[\w-]{11}$/.test(videoId) && !results.some((result)=>result.videoId === videoId)) {
            results.push({
                videoId,
                title: plainText(video.title),
                channel: plainText(video.ownerText),
                duration: plainText(video.lengthText)
            });
        }
    }
    for (const child of Object.values(record))collectVideos(child, results);
}
async function GET(request) {
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 2 || query.length > 120) {
        return Response.json({
            error: "Enter 2–120 characters to search."
        }, {
            status: 400
        });
    }
    try {
        const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Accept-Language": "en-US,en;q=0.9"
            },
            cache: "no-store",
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error("YouTube search did not respond.");
        const html = await response.text();
        const marker = "var ytInitialData = ";
        const start = html.indexOf(marker);
        if (start < 0) throw new Error("YouTube search results are unavailable.");
        const jsonStart = start + marker.length;
        const jsonEnd = html.indexOf(";</script>", jsonStart);
        if (jsonEnd < 0) throw new Error("YouTube search results are unavailable.");
        const data = JSON.parse(html.slice(jsonStart, jsonEnd));
        const results = [];
        collectVideos(data, results);
        return Response.json({
            results: results.slice(0, 12)
        });
    } catch  {
        return Response.json({
            error: "Search is temporarily unavailable. Try again in a moment."
        }, {
            status: 502
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1enu0lj._.js.map