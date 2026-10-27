# Chess's vendored libraries

Copied unchanged from npm (only the files Chess uses), so the app loads nothing from other sites.

| Folder | Package | Version | License |
| --- | --- | --- | --- |
| `cm-chessboard/` | [cm-chessboard](https://github.com/shaack/cm-chessboard) (`src/` and `assets/`) | 8.15.3 | MIT, Copyright (c) Stefan Haack. The pieces (`assets/pieces/standard.svg`) are the Wikimedia Commons standard set by Cburnett, CC BY-SA 3.0, credited on the app's page. The Staunty set is CC BY-NC-SA and is not used. |
| `chess.js/` | [chess.js](https://github.com/jhlywa/chess.js) (`dist/esm/chess.js`) | 1.4.0 | BSD-2-Clause, Copyright (c) Jeff Hlywa |

SHA-256 of each file:

```
0b3a3c2b4432a26bb18f9d06f5bba4de015bcc980306b7db28b06025495e2186  ./chess.js/LICENSE.txt
76c7c34f0e2e9ab076521a5d6fe786a9cce537bb1b6f29d32a9c9970b5b232d2  ./chess.js/chess.js
ccf51777fa25224a3548f958a35e4e8ad06db976bd7e56d39bc4baf91fc2fa8e  ./cm-chessboard/LICENSE.txt
4e65b608f0f4e475fb0c8c98b4d1cc370d2ab05156448b135a9f026ef03be887  ./cm-chessboard/assets/chessboard.css
4b1cdb03bb8a46d2692d6d930aee2907931492d87043eaa118fb8faae8953d79  ./cm-chessboard/assets/extensions/markers/markers.css
3b01fbeecc578d61da3d4904ac35fb80a45f29113615fe655fbad86556d4dd46  ./cm-chessboard/assets/extensions/markers/markers.svg
fb328e9b71d2aa83f016a68a63ddb5bd41c6aae0ebc6df91a124ce429c8d2234  ./cm-chessboard/assets/extensions/promotion-dialog/promotion-dialog.css
b85bba95342a9483420999cedeb1c503e6db16cdd7a0da1f3a228549a13134c5  ./cm-chessboard/assets/pieces/standard.svg
6582efba87300738ab2ac48286162900c368ed12ce069c2713946dc019f82cd0  ./cm-chessboard/src/Chessboard.js
6ed60c5a7a8aab25debaab309049f05432539387b5ab1100878eed4d92abc177  ./cm-chessboard/src/extensions/markers/Markers.js
60b1959dd8bc44fd26eb339c3859c0746a16aa78b75e1f67aa792bb98afeb411  ./cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js
bacbf9de8ee6b782e5f237204d848018d484802e9b9e77ad36df5fc6547ab754  ./cm-chessboard/src/lib/Svg.js
971a1695cfc198e80a9f2dbc7ee188b3e5e82069093c1c218ce8dd8210c25597  ./cm-chessboard/src/lib/Utils.js
b3d7cde7663f6b5432110015bf1bdce5ca4b4ccdd8c7bc2d49eb87fa95a14f1d  ./cm-chessboard/src/model/ChessboardState.js
2657c0e59148eef29aed16e2672f6cc650ed2abcf6846838cfbb85b4bea01357  ./cm-chessboard/src/model/Extension.js
65d8bfcb879f16c3aadd6a6e5514f90e9f161ea2028cc2d46427e5b08de7677d  ./cm-chessboard/src/model/Position.js
cdbbd0f63bd4be43c31c2b5bad118843772a19fe3c907b2e1186caf2665e19bb  ./cm-chessboard/src/view/ChessboardView.js
fddb37f73ef1f8fb5f100dc461308415fdf00787c6ab839c811a8abfc5b1bbe1  ./cm-chessboard/src/view/PositionAnimationsQueue.js
3b028a2b82f904c7f7732213c39f680c45e7805ad0a82226a264851ea589a275  ./cm-chessboard/src/view/VisualMoveInput.js
```
