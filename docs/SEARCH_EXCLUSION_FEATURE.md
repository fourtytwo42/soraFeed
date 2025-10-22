# Search Exclusion Feature

## Overview

The search functionality in SoraFeed now supports **exclusion terms** using the minus (`-`) operator. This allows you to search for content that contains certain words while explicitly excluding results that contain other words.

## How to Use

### Basic Exclusion
To exclude a word from your search results, prefix it with a minus sign (`-`):

```
cat -dog
```
This will return results that contain "cat" but do NOT contain "dog".

### Multiple Exclusions
You can exclude multiple terms by using multiple minus signs:

```
video -cat -music
```
This will return results that contain "video" but exclude any results containing "cat" OR "music".

### Complex Searches
You can combine multiple include terms with multiple exclude terms:

```
funny animal -cat -dog -bird
```
This will return results that contain both "funny" AND "animal" but exclude any results containing "cat", "dog", or "bird".

## Where It Works

The exclusion functionality works in:

1. **Normal Search**: Use the search bar at the top of the application
2. **Custom Feed Blocks**: When creating custom feeds, you can use exclusion terms in each search block

## Examples

### Example 1: Find car content without racing
```
car -racing -race -speed
```

### Example 2: Find cooking content without specific ingredients
```
cooking recipe -meat -chicken -beef
```

### Example 3: Find nature content without animals
```
nature landscape -animal -bird -cat -dog
```

## Technical Details

- Exclusion terms are case-insensitive
- The search will return empty results if you only provide exclusion terms (you need at least one include term)
- Exclusion works with both fast search (random sampling) and full search (relevance-based)
- The feature works with all search matching strategies: full-text search, partial matching, and fuzzy matching

## Custom Feed Integration

When creating custom feeds, you can use exclusion terms in each search block:

1. Open the Custom Feed Builder
2. Create a new search block
3. Enter your search query with exclusion terms (e.g., "nature -animal")
4. Set the duration and add to your timeline

The custom feed will automatically use the exclusion functionality when playing each block.

## Notes

- Make sure to include at least one positive search term (without `-`)
- Exclusion terms must be at least 2 characters long (the `-` plus at least one character)
- Spaces around the minus sign are optional: both `cat -dog` and `cat-dog` work the same way
