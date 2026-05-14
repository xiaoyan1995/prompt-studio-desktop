# Prompt Studio Desktop Design

## Visual Thesis

The desktop version preserves the existing Prompt Studio workspace: quiet, dense, utility-first, with the current sidebar, top bar, cards, and modals unchanged.

## Content Plan

The main screen remains the project manager. Desktop-only additions are limited to a settings modal for AI/provider configuration and a companion extension folder users can load in Chrome or Edge.

## Interaction Plan

The desktop shell starts the local API before showing the window, keeps the app focused on the existing workspace, and exposes settings through the top bar and application menu.

## Compatibility

The companion extension talks to the desktop API on `127.0.0.1:8767`. The original project continues to use `127.0.0.1:8766`, so both versions can coexist.
