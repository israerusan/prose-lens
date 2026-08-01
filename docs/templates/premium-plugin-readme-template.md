# Premium Obsidian Plugin README Template

Use this when a plugin is **free + paid upgrade** or fully paid and you want the README to feel like a product page instead of dev notes.

## What this template is optimizing for

- a **premium first screen**
- fast understanding for skimmers
- clear **Free vs Pro** split
- trust signals near the top
- a buying path that feels safe and obvious
- proof assets that show a problem and a payoff, not just UI

---

## 1) Top-of-page structure

Use this order near the top:

1. **Plugin name**
2. **Outcome headline**
3. **Hero still optimized for skimmers**
4. **Trust row**
5. **1 short value paragraph**
6. **Free / Pro split**
7. **Top CTA**
8. **Secondary proof asset**
9. **Safety note**

If the top screen does not answer *what gets better, why pay, and why trust this?* then it is not done.

---

## 2) Copy template

```md
# {{PLUGIN_NAME}}

{{OUTCOME_HEADLINE}}

![{{HERO_ALT_TEXT}}]({{HERO_IMAGE_URL}})

**{{TRUST_SIGNAL_1}}** · **{{TRUST_SIGNAL_2}}** · **{{TRUST_SIGNAL_3}}** · **{{TRUST_SIGNAL_4}}**

{{PLUGIN_NAME}} gives {{PRODUCT_CONTEXT}} a real {{CATEGORY_LABEL}} pass. It surfaces {{PROBLEM_1}}, {{PROBLEM_2}}, {{PROBLEM_3}}, and {{PROBLEM_4}} *while you {{CORE_WORKFLOW}}* — so {{PRIMARY_OUTCOME}}.

- **Free:** {{FREE_TIER_SUMMARY}}.
- **Pro — {{PRICE}} {{PRICE_MODEL}}:** {{PAID_WEDGE_LABEL}} — {{PRO_FEATURE_1}}, {{PRO_FEATURE_2}}, {{PRO_FEATURE_3}}, and {{PRO_FEATURE_4}}. {{PAID_TRUST_LINE}}.
- **Buy once, unlock fast:** [Buy {{PLUGIN_NAME}} Pro]({{BUY_URL}}) — {{DELIVERY_LINE}}.

![{{SECONDARY_PROOF_ALT_TEXT}}]({{SECONDARY_PROOF_URL}})

> {{SAFETY_NOTE}}
```

---

## 3) Example top block shape

```md
# Example Plugin

Turn scattered research into cleaner notes without leaving Obsidian.

![Before and after comparison showing a messy research note becoming more structured and easier to scan](https://example.com/hero.png)

**Works offline** · **Pay once** · **Unlimited updates** · **No account**

Example Plugin gives Obsidian a real research cleanup pass. It surfaces duplicate ideas, vague headings, buried action items, and structural clutter *while you revise* — so the note gets easier to scan before you ship it.

- **Free:** structure linting, outline health, note stats, and section-level signals.
- **Pro — $19 one-time:** the serious cleanup tools — duplicate cluster detection, rewrite delta, focus mode, and export QA. No subscription, no account, unlimited future updates.
- **Buy once, unlock fast:** [Buy Example Plugin Pro](https://example.com/buy) — your key arrives automatically within seconds and activates offline.

![Live cleanup proof showing the note getting shorter, clearer, and more structured](https://example.com/proof.gif)

> Example Plugin never edits your notes. It only highlights and guides decisions.
```

---

## 4) Headline rules

Good headline shape:
- outcome first
- concrete transformation
- no jargon
- no feature taxonomy

### Good
- Tighten bloated drafts into cleaner copy without leaving Obsidian.
- Turn scattered notes into clearer structure without leaving Obsidian.
- Catch weak claims before they leave the note.

### Bad
- Advanced editorial analysis for Obsidian.
- Live writing feedback in your editor.
- A plugin for improving notes.

If the headline sounds like a category label, it is too weak.

---

## 5) Trust row rules

Best trust row is short, plain, and true.

Preferred patterns:
- **Works offline**
- **Pay once**
- **Unlimited updates**
- **No account**

Alternates if relevant:
- **Local-first**
- **No telemetry**
- **One-time payment**
- **Yours forever**

Do not make the trust row sound like legal copy or startup fluff.

---

## 6) Hero asset rules

### The hero must communicate in 2 seconds:
1. what was wrong before
2. what got better after
3. why the plugin helped

### Prefer this pattern
- **static payoff still first**
- **motion proof second**

### Good hero traits
- before/after visible at a glance
- important proof larger than UI chrome
- no black dead space
- no microscopic side panels
- readable metrics or evidence chips
- one obvious story

### Bad hero traits
- random colored highlights
- dead margins
- giant empty app chrome
- tiny proof details
- motion that only makes sense after waiting

### If a side panel is too small to read
Extract the meaningful evidence into larger chips/cards:
- words cut
- repeats removed
- issue count reduced
- score improved
- structure cleaned up

The point is to show **evidence**, not preserve every pixel of the raw UI.

---

## 7) Free vs Pro copy rules

The paid tier should sound like a deliberate upgrade, not leftover features.

### Better shape
- **Pro — $12 one-time:** the serious rewrite tools — ...
- **Pro — $29 one-time:** the advanced research workflow — ...
- **Pro — $39 one-time:** the publishing layer — ...

### Avoid
- “extra features”
- “additional tools”
- weak, apologetic upsell language

For this style of plugin, say early if true:
- no subscription
- no account
- unlimited future updates
- offline activation / offline verification

---

## 8) Secondary proof asset rules

This is where the live GIF/video proof goes.

Its job is not to be the first thing the reader decodes.
Its job is to prove the hero is honest.

Use it to show:
- a live rewrite pass
- a cleanup pass
- metrics changing
- panel counts improving
- focus mode / paid wedge in action

If the motion asset sells the free tier better than the paid tier, it is the wrong asset for a freemium README.

---

## 9) Recommended lower sections

After the top block, use this general order:

1. **What makes it different**
2. **What it marks / what it detects**
3. **Free vs Pro**
4. **Pricing**
5. **Activate Pro**
6. **FAQ**
7. **Honest limitations**
8. **Who this is for**
9. **Install**
10. **Commands**
11. **Support**
12. **Development**
13. **License**

You do **not** need a second giant CTA section if the top CTA is already clear.

---

## 10) Pricing block template

```md
## Pricing

- **Free** — {{FREE_FULL_SUMMARY}}.
- **Pro — {{PRICE}} {{PRICE_MODEL}}** — {{PAID_WEDGE_LABEL}}: {{PRO_FEATURE_1}}, {{PRO_FEATURE_2}}, {{PRO_FEATURE_3}}, and {{PRO_FEATURE_4}}. {{PAID_LONG_TRUST_LINE}}.
```

Example trust line:
- `No subscription, no expiry, no account. Yours forever, including unlimited future updates.`

---

## 11) Activation block template

```md
## Activate Pro

1. [Buy {{PLUGIN_NAME}} Pro]({{BUY_URL}}) — {{PRICE}} {{PRICE_MODEL}}.
2. {{DELIVERY_LINE_SHORT}}.
3. Paste it into the plugin's settings. Pro unlocks instantly, {{ACTIVATION_MODE}}.
```

Example:
- `Your license key arrives automatically within seconds — no waiting, no manual delivery.`
- `verified offline`

---

## 12) FAQ lines worth reusing

### Why pay if the source is MIT?
```md
**The source is MIT — why pay?**
You are paying for the Pro features, the activation key, and for the plugin to keep improving.
One purchase unlocks the paid tier and includes unlimited future updates.
```

### Privacy / telemetry
```md
**Does {{PLUGIN_NAME}} send my data anywhere?**
No. {{NETWORK_TRUST_LINE}}.
```

### Safety / editing behavior
```md
**Will it edit my notes for me?**
No. It highlights patterns and leaves the decision to you.
```

---

## 13) Premium-readme checklist

Before shipping, verify:

- [ ] headline sells an outcome, not a category
- [ ] hero shows payoff instantly
- [ ] no dead space or tiny unreadable proof
- [ ] trust row is near the top
- [ ] paid tier is legible within the first screen
- [ ] one-time payment / unlimited updates are visible if true
- [ ] top CTA is obvious and safe
- [ ] lower sections do not repeat the same sales pitch three times
- [ ] motion proof supports the pitch instead of replacing it
- [ ] the page feels like a product page, not raw plugin docs

---

## 14) Notes from the Prose Lens pass

What worked:
- static before/after hero first
- motion proof second
- trust row immediately under hero
- strong emphasis on one-time payment + unlimited updates
- a top CTA that explains key delivery speed and offline activation
- removing duplicate lower CTA noise

What did **not** work:
- heroes with black dead space
- highlight-only openers with no payoff story
- tiny panel crops that required squinting
- repeating the buy ask too many times lower down
- polite explanatory copy when a harder outcome line was needed
