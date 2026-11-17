/**
 * PantaRhei Multi-Token Reactive Bean Search & Indexing Engine
 * Provides instant fuzzy and tokenized intersection searching across
 * all bean metadata: roaster, name, countryOfOrigin, region, farm,
 * single/multi-varietals, process, altitude, cropYear, and tastingNotes.
 */

import type { PantaBean, BeanQueryOptions } from "../types/bean.ts";
import { getVarietalsList } from "../types/bean.ts";

export class BeanSearchIndex {
  private beans: PantaBean[] = [];
  // Token to set of bean IDs
  private tokenIndex: Map<string, Set<string>> = new Map();
  private beanMap: Map<string, PantaBean> = new Map();

  constructor(beans: PantaBean[] = []) {
    if (beans.length > 0) {
      this.indexBeans(beans);
    }
  }

  /**
   * Rebuilds the inverted index with a fresh list of beans
   */
  public indexBeans(beans: PantaBean[]): void {
    this.beans = beans;
    this.tokenIndex.clear();
    this.beanMap.clear();

    for (const bean of beans) {
      this.beanMap.set(bean.id, bean);
      const tokens = this.extractTokens(bean);

      for (const token of tokens) {
        let idSet = this.tokenIndex.get(token);
        if (!idSet) {
          idSet = new Set<string>();
          this.tokenIndex.set(token, idSet);
        }
        idSet.add(bean.id);
      }
    }
  }

  /**
   * Tokenizes text into normalized lowercase alphanumeric search tokens
   */
  private tokenizeText(text?: string): string[] {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[/\\(),._\-+]/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  /**
   * Extracts all searchable tokens for a given bean
   */
  private extractTokens(bean: PantaBean): Set<string> {
    const tokens = new Set<string>();

    const addTokens = (text?: string) => {
      for (const t of this.tokenizeText(text)) {
        tokens.add(t);
      }
    };

    addTokens(bean.name);
    addTokens(bean.roaster);
    addTokens(bean.countryOfOrigin);
    addTokens(bean.region);
    addTokens(bean.farm);
    addTokens(bean.process);
    addTokens(bean.cropYear);

    // Multi-varietal indexing: index each distinct variety and its sub-tokens
    const varietals = getVarietalsList(bean.varietal);
    for (const v of varietals) {
      addTokens(v);
    }

    // Altitude tokens: e.g. "1900-2200m" -> "1900", "2200", "1900m", "2200m", "1900-2200m"
    // Also indexes 50m increments in range (e.g. 2050, 2100, 2150) so queries for 2100 match 1900-2200m
    if (bean.altitude) {
      addTokens(bean.altitude);
      const cleanAlt = bean.altitude.toLowerCase().replace(/m/g, "");
      addTokens(cleanAlt);
      const numMatches = cleanAlt.match(/\d+/g);
      if (numMatches) {
        for (const num of numMatches) {
          tokens.add(num);
          tokens.add(num + "m");
        }
        if (numMatches.length >= 2) {
          const min = parseInt(numMatches[0], 10);
          const max = parseInt(numMatches[1], 10);
          if (!isNaN(min) && !isNaN(max) && min < max && max - min <= 1000) {
            for (let a = Math.ceil(min / 50) * 50; a <= max; a += 50) {
              tokens.add(a.toString());
              tokens.add(a.toString() + "m");
            }
          }
        }
      }
    }

    // Tasting notes
    if (bean.tastingNotes && Array.isArray(bean.tastingNotes)) {
      for (const note of bean.tastingNotes) {
        addTokens(note);
      }
    }

    return tokens;
  }

  /**
   * Searches beans using multi-token intersection matching with facet filters
   */
  public search(query: string, filterOptions?: BeanQueryOptions): PantaBean[] {
    const queryTokens = this.tokenizeText(query);
    let candidateIds: Set<string> | null = null;

    if (queryTokens.length > 0) {
      for (const qToken of queryTokens) {
        // Collect all matching bean IDs for this query token (prefix / substring match)
        const tokenMatches = new Set<string>();

        for (const [indexedToken, idSet] of this.tokenIndex.entries()) {
          const isMatch =
            indexedToken === qToken ||
            indexedToken.startsWith(qToken) ||
            indexedToken.includes(qToken) ||
            qToken.startsWith(indexedToken) ||
            (qToken.endsWith("s") && indexedToken.startsWith(qToken.slice(0, -1))) ||
            (indexedToken.endsWith("s") && qToken.startsWith(indexedToken.slice(0, -1)));

          if (isMatch) {
            for (const id of idSet) {
              tokenMatches.add(id);
            }
          }
        }

        // Intersect with previous matches (AND logic)
        if (candidateIds === null) {
          candidateIds = tokenMatches;
        } else {
          const intersected = new Set<string>();
          for (const id of candidateIds) {
            if (tokenMatches.has(id)) {
              intersected.add(id);
            }
          }
          candidateIds = intersected;
        }

        // Fast exit if intersection is empty
        if (candidateIds.size === 0) {
          break;
        }
      }
    }

    // If query was empty, start with all beans
    const targetBeans =
      candidateIds === null
        ? [...this.beans]
        : Array.from(candidateIds)
            .map((id) => this.beanMap.get(id))
            .filter((b): b is PantaBean => b !== undefined);

    // Apply facet filters
    return targetBeans.filter((bean) => this.matchesFilters(bean, filterOptions));
  }

  /**
   * Applies facet/chip filtering (roaster, country, varietal, process, freeze status, stock)
   */
  private matchesFilters(bean: PantaBean, options?: BeanQueryOptions): boolean {
    if (!options) return true;

    if (options.roaster && bean.roaster.toLowerCase() !== options.roaster.toLowerCase()) {
      return false;
    }

    if (
      options.countryOfOrigin &&
      bean.countryOfOrigin.toLowerCase() !== options.countryOfOrigin.toLowerCase()
    ) {
      return false;
    }

    if (options.varietal) {
      const target = options.varietal.toLowerCase();
      const beanVarieties = getVarietalsList(bean.varietal).map((v) => v.toLowerCase());
      const hasMatch = beanVarieties.some((v) => v === target || v.includes(target));
      if (!hasMatch) return false;
    }

    if (options.process && bean.process.toLowerCase() !== options.process.toLowerCase()) {
      return false;
    }

    if (options.isFrozen !== undefined && bean.isFrozen !== options.isFrozen) {
      return false;
    }

    if (options.inStock !== undefined) {
      const inStock = bean.remainingGrams > 0;
      if (inStock !== options.inStock) return false;
    }

    if (options.archived !== undefined) {
      const isArchived = Boolean(bean.archived);
      if (isArchived !== options.archived) return false;
    }

    return true;
  }

  /**
   * Retrieves unique roaster list for quick-filter chips
   */
  public getUniqueRoasters(): string[] {
    const roasters = new Set<string>();
    for (const b of this.beans) {
      if (b.roaster) roasters.add(b.roaster);
    }
    return Array.from(roasters).sort();
  }

  /**
   * Retrieves unique country list for quick-filter chips
   */
  public getUniqueCountries(): string[] {
    const countries = new Set<string>();
    for (const b of this.beans) {
      if (b.countryOfOrigin) countries.add(b.countryOfOrigin);
    }
    return Array.from(countries).sort();
  }

  /**
   * Retrieves unique varietals list across all beans
   */
  public getUniqueVarietals(): string[] {
    const varietals = new Set<string>();
    for (const b of this.beans) {
      for (const v of getVarietalsList(b.varietal)) {
        varietals.add(v);
      }
    }
    return Array.from(varietals).sort();
  }
}
