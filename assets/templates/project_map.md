# 🗺️ PROJECT_MAP

## 🆔 IDENTITY
- **Mode**: {{mode}}
- **Markers**: {{markers}}

{{#if isEngineering}}
## 🏗️ ARCHITECTURE (Blueprint)
```mermaid
{{blueprint}}
```

## 🧠 KNOWLEDGE GRAPH (Symbols)
```mermaid
{{knowledge_graph}}
```
{{else}}
## 📝 SCRIPT OVERVIEW
> This project is identified as a Script Collection.
> Focus on individual file syntax and specific logic implementation rather than high-level architecture.
{{/if}}
