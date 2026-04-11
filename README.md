# Max Connectors

A FigJam plugin for quickly connecting two selected objects with a styled connector.

## What it does

Select any two objects and run the plugin — it instantly creates a connector between them with consistent styling. The plugin automatically determines the direction of the arrow and finds the best attachment point.

## Commands

**Max Connectors > Connector** — creates a connector without a label.

**Max Connectors > Connector with text** — creates a connector with a label. Double-click the connector to type.

Both commands are available in FigJam's Quick Actions (⌘/).

## Setup

The plugin requires a master connector named **Master Connector** to exist somewhere on the current page. This connector acts as a style template — the plugin clones it and connects it to the selected objects.

1. Create a connector in FigJam and name it `Master Connector`
2. Style it however you like (stroke color, weight, arrow caps, label formatting, etc.)
3. Select two objects and run the plugin

The plugin remembers the master connector's ID so subsequent runs are fast.

## Smart direction

The plugin determines the direction of the arrow automatically:

- If one object is a child of a frame (e.g. a button inside a screen) and the other is a top-level frame — the child is always the **start** (source), the frame is the **end** (destination). This matches the typical user flow pattern where a UI element triggers a new screen.
- Otherwise, the leftmost object (by horizontal center) is the start. If they're aligned horizontally, the topmost is the start.

## Smart attachment

The connector attaches to the edge of each object that faces the other:

- If there's enough space between the objects, the connector exits from the facing side (left/right or top/bottom).
- If the objects are too close, the plugin falls back to a perpendicular side to avoid the connector overlapping the objects.
- If an object is nested inside an instance or frame, the connector attaches to the nearest accessible ancestor with a position offset pointing to the original object's edge.

## Development

```bash
npm install
npm run build     # compile once
npm run watch     # compile on save
```

Compiled output is `code.js`. Load the plugin in FigJam via Plugins > Development > Import plugin from manifest.
