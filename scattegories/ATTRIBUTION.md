# Attribution

The original [Scattergories List Generator](https://swellgarfo.com/scattergories/) was designed and created by Swellgarfo. Full credit for the original experience belongs to Swellgarfo.

The main Scattegories route checks whether Swellgarfo's original is reachable and lets the visitor choose between the original and the retained fallback. It never redirects automatically. The original currently sends an `X-Frame-Options: SAMEORIGIN` response header, so browsers will not allow puzzle.seall.dev to embed it in an iframe.

The `local/` directory contains the retained, dependency-free fallback used when the original becomes unavailable. It does not contain Swellgarfo's compiled JavaScript or CSS bundle because no redistribution license was published with those files when this fallback was created.
