# Keep LinkedIn extraction on demand and read-only

Phase 2 will inspect an Individual LinkedIn Post Page only after the user opens modaicom, using on-demand scripting with temporary `activeTab` access. It will not use persistent LinkedIn host permissions or a persistent content script, and it will keep extraction read-only with no URL or content persistence, transmission, or logging; this limits access and preserves user control while the context-extraction boundary is proven.
