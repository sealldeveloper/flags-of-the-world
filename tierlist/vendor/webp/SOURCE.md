# Vendored lossless WebP encoder

- Source: `@jsquash/webp` 1.5.0, https://registry.npmjs.org/@jsquash/webp/-/webp-1.5.0.tgz
- Registry integrity verified before extraction: `sha512-KggLoj2MnRSfIqTeKe1EmbljTX2vuV7mh79k89PCL1pyqiDULcPM1L47twxXt0hkb68F70bXiL31MxsuoZtKFw==`
- Upstream: https://github.com/jamsinclair/jSquash
- No package installation scripts were executed.
- Included only the baseline encoder and its dependencies, not the decoder or SIMD binary.
- Local adaptation: `wasm-feature-detect` is replaced with a constant false SIMD selector. No runtime npm/CDN dependency is used. A whitespace-only upstream line in `webp_enc.js` is trimmed for the repository whitespace check.
- Application options explicitly enable lossless mode, exact transparent colours, full alpha quality and no near-lossless quantization. Encoding runs in a dedicated browser Worker. The smaller of the original supported file and the lossless encoding is retained without changing dimensions. JPEG/WebP originals are preserved rather than lossy re-encoded. Transparent, higher-bit-depth and colour-profiled PNG originals bypass browser re-encoding to retain their original alpha, colour and precision.
- Apache-2.0 wrapper license is in `LICENSE`. The libwebp license is in `codec/LICENSE.codec.md`.
