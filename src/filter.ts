export interface IFilter {
  pattern: string;
  label: string;
}

class Filter {
  private regex: RegExp;
  private label: string;
  private valueMap: Map<string, number> = new Map();
  private counter = 0;

  constructor(filter: IFilter) {
    this.regex = new RegExp(filter.pattern, 'g');
    this.label = filter.label;
  }

  replace(text: string): string {
    return text.replace(this.regex, (match: string) => {
      const existing = this.valueMap.get(match);
      if (existing !== undefined) {
        return this.formatLabel(existing);
      }
      this.counter++;
      this.valueMap.set(match, this.counter);
      return this.formatLabel(this.counter);
    });
  }

  private formatLabel(num: number): string {
    if (this.label.includes('#')) {
      return this.label.replace('#', String(num));
    }
    return this.label;
  }
}

export function applyFilters(text: string, filters: IFilter[]): string {
  let result = text;
  const filterInstances = filters.map(f => new Filter(f));
  for (const filter of filterInstances) {
    result = filter.replace(result);
  }
  return result;
}
