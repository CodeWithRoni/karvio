import { useMemo, useState } from 'react';
import { qty } from '../lib/format';
import { Btn } from './ui';

export function ProductTreeIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 2v9a2 2 0 0 0 2 2h2M2 5h4M7 3h6v4H7zM7 11h6v4H7z" />
  </svg>;
}

function FolderIcon({ open }) {
  return <svg className="pos-tree-folder" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
    {open
      ? <path d="M2 13V3h4l2 2h5v3M2 13l2-5h11l-2 5z" />
      : <path d="M2 3h4l2 2h6v8H2z" />}
  </svg>;
}

function catalogTree(products, categories, brands, query, stockFilter) {
  const categoryNames = new Map(categories.map(({ id, name }) => [id, name]));
  const brandNames = new Map(brands.map(({ id, name }) => [id, name]));
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const groups = new Map();

  for (const product of products) {
    if (!product.active) continue;
    const inStock = (product.available ?? product.stock) > 0;
    if (stockFilter === 'in' && !product.service && !inStock) continue;
    if (stockFilter === 'out' && (product.service || inStock)) continue;

    const { category_id, subcategory_id, brand_id } = product;
    const group = categoryNames.get(category_id);
    const category = categoryNames.get(subcategory_id);
    const brand = brandNames.get(brand_id);
    const searchable = [product.name, product.sku, product.barcode, group, category, brand].join(' ').toLowerCase();
    if (!terms.every((term) => searchable.includes(term))) continue;

    const path = [
      [group ? category_id : '', group || 'Ungrouped'],
      [category ? subcategory_id : '', category || 'Uncategorized'],
      [brand ? brand_id : '', brand || 'No brand'],
    ];
    let branches = groups;
    const keys = [];
    for (const [id, name] of path) {
      keys.push(id);
      if (!branches.has(id)) branches.set(id, { key: JSON.stringify(keys), name, branches: new Map(), products: [] });
      const branch = branches.get(id);
      branches = branch.branches;
      if (keys.length === path.length) branch.products.push(product);
    }
  }
  return groups;
}

function TreeBranches({ branches, expanded, searching, onToggle, onPick }) {
  return <ul className="pos-tree-branches">
    {[...branches.values()].sort((a, b) => a.name.localeCompare(b.name)).map((branch) => {
      const open = expanded.get(branch.key) ?? searching;
      return <li key={branch.key}>
        <button type="button" className="pos-tree-branch" aria-expanded={open} onClick={() => onToggle(branch.key, !open)}>
          <svg className="pos-tree-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 2 4 4-4 4" /></svg>
          <FolderIcon open={open} />
          <span title={branch.name}>{branch.name}</span>
        </button>
        {open && (branch.branches.size
          ? <TreeBranches branches={branch.branches} expanded={expanded} searching={searching} onToggle={onToggle} onPick={onPick} />
          : <ul className="pos-tree-branches">
            {branch.products.slice().sort((a, b) => a.name.localeCompare(b.name)).map((product) => (
              <li className="pos-tree-product" key={product.id}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" aria-hidden="true"><path d="m8 1 6 3.5v7L8 15l-6-3.5v-7zM2 4.5 8 8l6-3.5M8 8v7" /></svg>
                <div><b title={product.name}>{product.name}</b><small>{product.service ? 'Service' : `${qty(product.available ?? product.stock, product.unit)} in stock`}</small></div>
                <button type="button" className="pos-tree-add" aria-label={`Add ${product.name}`} title={`Add ${product.name}`} onClick={() => onPick(product)}>
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M6 2v8M2 6h8" /></svg>
                </button>
              </li>
            ))}
          </ul>)}
      </li>;
    })}
  </ul>;
}

export default function PosProductTree({ id, products, categories, brands, onClose, onPick }) {
  const [query, setQuery] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [expanded, setExpanded] = useState(() => new Map());
  const [searchExpanded, setSearchExpanded] = useState(() => new Map());
  const searching = Boolean(query.trim());
  const branches = useMemo(() => catalogTree(products, categories, brands, query, stockFilter), [products, categories, brands, query, stockFilter]);

  function toggle(key, open) {
    const set = searching ? setSearchExpanded : setExpanded;
    set((current) => new Map(current).set(key, open));
  }

  return <aside id={id} className="pos-product-tree" aria-label="Product tree">
    <div className="pos-tree-head">
      <strong>Product tree</strong>
      <Btn size="sm" type="button" className="pos-tree-close" aria-label="Close product tree" onClick={onClose}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="m3 3 6 6m0-6L3 9" /></svg>
      </Btn>
    </div>
    <div className="pos-tree-filters">
      <input type="search" aria-label="Search product tree" placeholder="Search products" value={query} onChange={(event) => {
        setQuery(event.target.value);
        setSearchExpanded(new Map());
      }} />
      <select aria-label="Product tree stock filter" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
        <option value="">All stock</option>
        <option value="in">In stock</option>
        <option value="out">Out of stock</option>
      </select>
    </div>
    <div className="pos-tree-list">
      {branches.size
        ? <TreeBranches branches={branches} expanded={searching ? searchExpanded : expanded} searching={searching} onToggle={toggle} onPick={onPick} />
        : <p className="muted">No matching products.</p>}
    </div>
  </aside>;
}
