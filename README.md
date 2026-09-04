# JesseOS

A browser-based, electric-phosphor-green terminal for the **Lobster Box**: a poetic, half-lost prompt disguised as a tiny operating system.

JesseOS v0.2 is deliberately **local first**. It does not call a large-language-model API, send prompts to an AI service, scrape arbitrary websites, or pretend it knows current events. Instead, it makes an unstable voice from a curated text corpus and the exchanges it stores in the visitor’s browser.

## How it works

- **Trigram Markov dream engine:** Builds phrase transitions from the bundled JesseOS corpus plus locally stored conversations, then generates new fragmentary sentences from that chain.
- **Memory vault:** Stores exchanges in the browser’s IndexedDB database. Memories are available only in that browser and on that device unless exported and imported manually.
- **Memory weighting:** Relevant terms, pinned entries, recency, and prior recalls influence which old exchange resurfaces as an `echo`.
- **Response modes:** JesseOS chooses a loose mode such as `DREAM`, `RECALL`, `FIELD NOTE`, `SOFT SIGNAL`, or `ORDINARY KNOWLEDGE`.
- **Honest boundaries:** If asked for live weather, news, prices, or another current fact, JesseOS says it has no live feed instead of manufacturing an answer.

## Commands

```text
help
clear
about
memory
recall
recall <words>
remember <text>
pin <number>
export memory
import memory
forget all
source
```

### Privacy

- Conversations remain in the current browser’s IndexedDB database.
- Clearing browser storage can erase that memory.
- `export memory` downloads a JSON archive you can keep privately.
- `import memory` restores a JesseOS archive into the current browser.
- This public repository contains code and a small curated seed corpus only. It does **not** receive or publish visitors’ private conversations.

## Future field receiver

A later version can add selected public, permission-respecting data feeds. Any external material should be clearly labelled with its source and timestamp. JesseOS should never blur a live factual source with an invented dream response.

## Run locally

Open `index.html` in a modern browser, or publish the repository with GitHub Pages. No build step and no API keys are required.
