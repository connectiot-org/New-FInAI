import { useMemo, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { downloadCsv } from "../../demo/selectors";
import { Empty } from "../ui";
export interface TableColumn<T> {
  key: keyof T & string;
  label: string;
  render?: (row: T) => ReactNode;
  value?: (row: T) => string | number;
  numeric?: boolean;
}
export function DataTable<T extends { id: string }>({
  data,
  columns,
  name = "records",
  onRow,
  extra,
  selectable = true,
}: {
  data: T[];
  columns: TableColumn<T>[];
  name?: string;
  onRow?: (row: T) => void;
  extra?: ReactNode;
  selectable?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selection, setSelection] = useState({});
  const defs = useMemo<ColumnDef<T>[]>(
    () => [
      ...(selectable
        ? [
            {
              id: "select",
              header: ({ table }) => (
                <input
                  type="checkbox"
                  aria-label="Select all rows on page"
                  checked={table.getIsAllPageRowsSelected()}
                  onChange={table.getToggleAllPageRowsSelectedHandler()}
                />
              ),
              cell: ({ row }) => (
                <input
                  type="checkbox"
                  aria-label={`Select ${row.original.id}`}
                  checked={row.getIsSelected()}
                  onClick={(e) => e.stopPropagation()}
                  onChange={row.getToggleSelectedHandler()}
                />
              ),
              enableSorting: false,
            } as ColumnDef<T>,
          ]
        : []),
      ...columns.map((c) => ({
        id: c.label,
        accessorFn: (row: T) => (c.value ? c.value(row) : row[c.key]),
        header: c.label,
        cell: ({ row }: { row: { original: T } }) =>
          c.render ? c.render(row.original) : String(row.original[c.key] ?? ""),
        meta: { numeric: c.numeric },
      })),
    ],
    [columns, selectable],
  );
  const table = useReactTable({
    data,
    columns: defs,
    state: { sorting, rowSelection: selection, globalFilter: query },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });
  const exportRows = (rows: T[]) =>
    downloadCsv(`${name}.csv`, [
      columns.map((c) => c.label + (c.numeric ? " (USD)" : "")),
      ...rows.map((r) =>
        columns.map((c) => {
          const value = c.value ? c.value(r) : r[c.key];
          return typeof value === "number"
            ? c.numeric
              ? value / 100
              : value
            : String(value ?? "");
        }),
      ),
    ]);
  return (
    <div className="table-panel">
      <div className="table-toolbar">
        <div className="search-input">
          <Search size={15} />
          <input
            aria-label={`Search ${name}`}
            placeholder={`Search ${name}…`}
            value={query}
            onChange={(e) => {
              const p = new URLSearchParams(params);
              if (e.target.value) p.set("q", e.target.value);
              else p.delete("q");
              setParams(p, { replace: true });
              table.setPageIndex(0);
            }}
          />
        </div>
        <div className="toolbar-actions">
          {extra}
          <button
            onClick={() =>
              exportRows(table.getSortedRowModel().rows.map((r) => r.original))
            }
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>
      {table.getSelectedRowModel().rows.length > 0 && (
        <div className="bulk-bar">
          <span>{table.getSelectedRowModel().rows.length} selected</span>
          <button
            onClick={() =>
              exportRows(
                table.getSelectedRowModel().rows.map((r) => r.original),
              )
            }
          >
            Export selected
          </button>
          <button onClick={() => setSelection({})}>Clear selection</button>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => (
                  <th
                    key={h.id}
                    className={
                      (h.column.columnDef.meta as { numeric?: boolean })
                        ?.numeric
                        ? "numeric"
                        : ""
                    }
                  >
                    {h.column.getCanSort() ? (
                      <button
                        className="sort"
                        onClick={h.column.getToggleSortingHandler()}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getIsSorted() === "asc" ? (
                          <ArrowUp size={12} />
                        ) : h.column.getIsSorted() === "desc" ? (
                          <ArrowDown size={12} />
                        ) : null}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id}>
                {r.getVisibleCells().map((c, i) => (
                  <td
                    key={c.id}
                    className={
                      (c.column.columnDef.meta as { numeric?: boolean })
                        ?.numeric
                        ? "numeric"
                        : ""
                    }
                  >
                    {onRow && i === (selectable ? 1 : 0) ? (
                      <button
                        className="text-link row-link"
                        onClick={() => onRow(r.original)}
                      >
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </button>
                    ) : (
                      flexRender(c.column.columnDef.cell, c.getContext())
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!table.getRowModel().rows.length && <Empty />}
      <div className="table-footer">
        <span>
          {table.getFilteredRowModel().rows.length} records ·{" "}
          {name.includes("ledger") ? "Amounts in USD" : "Local demo data"}
        </span>
        <div>
          <span>
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {Math.max(1, table.getPageCount())}
          </span>
          <button
            className="icon-btn"
            aria-label="Previous page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="icon-btn"
            aria-label="Next page"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
