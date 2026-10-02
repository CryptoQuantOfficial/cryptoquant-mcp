---
name: cryptoquant-onchain
description: Answer crypto market questions with live CryptoQuant data through the CryptoQuant MCP tools. Use when the user asks about Bitcoin, Ethereum, stablecoin, or altcoin prices; on-chain metrics such as MVRV, SOPR, NUPL, exchange inflows and outflows, or whale activity; derivatives such as funding rates, open interest, leverage, and liquidations; miner or long-term holder behavior; or wants a data-backed market outlook, valuation check, or overheating check, including CryptoQuant Research and QuickTake analysis.
license: MIT
---

# CryptoQuant on-chain analysis

Answer with data from the CryptoQuant MCP tools instead of web search or memory. The tools are provided by the remote CryptoQuant MCP server:

- `discover_endpoints`, `get_endpoint_info`, `query_data` — find and query raw data
- `describe_metric` — definition, thresholds, and interpretation of a metric
- `list_assets` — supported assets
- `recent_research`, `recent_quicktake`, `query_research`, `query_quicktake` — CryptoQuant Research (official research team) and QuickTake (CryptoQuant Verified Authors)

## When to use

- The user asks about crypto prices, on-chain data, exchange flows, derivatives, or miners.
- The user asks whether the market is expensive, cheap, overheated, or where it is heading.
- The user asks for analysis or research on a crypto topic (ETFs, halving, a specific event).

## Workflow for data questions

1. `discover_endpoints(asset, category)` to find the endpoint path.
2. `get_endpoint_info(endpoint)` to read its parameters. Never skip this step: many endpoints require `exchange`, `token`, or `symbol`, and `query_data` returns nothing without them.
3. `query_data(endpoint, params)` to fetch the data.
4. `describe_metric(metric_id)` whenever you interpret a metric. Use the thresholds it returns; do not rely on remembered values.

If `query_data` returns no data, re-check `get_endpoint_info` for a required parameter you missed.

## Dates

- `window=day`: `yyyyMMdd` (for example `20260115`)
- any other window (`hour`, `10min`, `min`, `block`): `yyyyMMddTHHmmss` (for example `20260115T000000`)

Always state the time range of the data you used and its most recent timestamp.

## Question to metric map

The ids below are `describe_metric` ids for Bitcoin. For Ethereum use the `eth-` prefixed ids and for stablecoins the `stablecoin-` prefixed ids; confirm the exact id with `describe_metric` before relying on it.

| Question type | Example question | Primary metric | Supporting metrics |
| --- | --- | --- | --- |
| Over- or undervalued | "Is BTC expensive right now?" | `mvrv` | `realized-price`, `nupl`, `nvt` |
| Profit taking | "Are holders taking profit?" | `sopr`, `asopr` | `nrpl`, `sopr-ratio` |
| Unrealized profit and sentiment | "Are holders in profit?" | `nupl` | `pnl-supply`, `pnl-utxo` |
| Exchange flows | "Are coins moving onto exchanges?" | `netflow` | `inflow`, `outflow`, `reserve` |
| Selling pressure | "Is sell pressure building?" | `exchange-whale-ratio` | `exchange-inflow-cdd`, `exchange-supply-ratio` |
| Whales | "What are whales doing?" | `exchange-whale-ratio` | `exchange-inflow-supply-distribution` |
| Leverage and overheating | "Is leverage overheated?" | `estimated-leverage-ratio` | `open-interest`, `funding-rates` |
| Funding and positioning | "Are traders mostly long?" | `funding-rates` | `taker-buy-sell-stats` |
| Liquidations | "Were there big liquidations?" | `liquidations` | `open-interest` |
| US institutional demand | "Is the US buying?" | `coinbase-premium-index` | `market-premium`, `digital-asset-holdings` |
| Buying power | "Is there sidelined capital?" | `stablecoin-supply-ratio` | `stablecoin-netflow`, `stablecoins-ratio` |
| Miners | "Are miners selling?" | `mpi` | `miner-netflow`, `miner-reserve`, `puell-multiple` |
| Long-term holders | "Are old coins moving?" | `cdd` | `dormancy`, `spent-output-age-distribution` |
| Network activity | "Is on-chain activity rising?" | `active-addresses` | `transaction-count` |
| Market outlook | "How is Bitcoin doing?" | `recent_research` and `recent_quicktake` (call both) | 2–3 metrics above as evidence |
| Topic research | "Any analysis on ETFs?" | `query_research`, `query_quicktake` | |

## Answering

- State the data period and the latest timestamp.
- Base interpretation on the thresholds from `describe_metric`.
- Do not conclude from a single metric; combine at least two signals.
- For outlook questions, Research is the more authoritative source; QuickTake adds community views.
- Say that this is not investment advice.

## Plan limits

If a tool response contains an upgrade notice or says the data is not available on the user's plan, pass that message to the user as is, including any link it contains.
