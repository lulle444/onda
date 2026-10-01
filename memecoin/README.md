# $RUGBRØD

*Den eneste rug, der aldrig bliver pulled.*

En test-meme-coin på **Base Sepolia (testnet)** plus en landingsside. Den har ingen værdi og er kun til at lære flowet.

- `contracts/Rugbrod.sol`: ERC-20 (OpenZeppelin) med fast supply på 1 mia. Ingen owner, mint, skat eller pause.
- `test/`: Hardhat-tests.
- `scripts/deploy.js`: deployer til Base Sepolia.
- `site/index.html`: statisk landingsside.

## Kom i gang

```bash
cd memecoin
npm install
npm test
```

## Deploy til testnet

1. Lav en **ny** wallet, der kun bruges til test. Brug aldrig din rigtige wallet.
2. Hent gratis Base Sepolia-ETH fra en faucet, f.eks. via Coinbase Developer Platform eller Alchemy.
3. `cp .env.example .env` og indsæt wallet'ens private key i `PRIVATE_KEY`.
4. `npm run deploy:sepolia`
5. Kopiér adressen ind i `CONTRACT_ADDRESS` i `site/index.html`.
6. (Valgfrit) Verificér kildekoden: `npx hardhat verify --network baseSepolia <adresse>`

## Landingssiden på Vercel

Lav et nyt Vercel-projekt fra dette repo med **Root Directory = `memecoin/site`**. Så er den helt adskilt fra Onda.
