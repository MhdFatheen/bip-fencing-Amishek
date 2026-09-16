const pageConfigs = {
  'tax-invoice': { title: 'Tax Invoice', sub: 'This is Tax Invoice Page', icon: 'bi-file-earmark-text-fill', color: '#0969da', bg: '#ddf4ff' },
  'purchase-bill': { title: 'Purchase Bill', sub: 'Welcome to Purchase Bill Page', icon: 'bi-bag-check-fill', color: '#1a7f37', bg: '#dafbe1' },
  quotation: { title: 'Quotation', sub: 'Quotation Page', icon: 'bi-file-earmark-spreadsheet-fill', color: '#bc4c00', bg: '#fff1e5' },
  'purchase-inventory': { title: 'Purchase Inventory', sub: 'Purchase Inventory Page', icon: 'bi-cart-plus-fill', color: '#8250df', bg: '#fbefff' },
  products: { title: 'Products', sub: 'Products Page', icon: 'bi-box-seam-fill', color: '#0969da', bg: '#ddf4ff' },
  salary: { title: 'Salary', sub: 'Salary Page', icon: 'bi-cash-stack', color: '#1a7f37', bg: '#dafbe1' },
  attendance: { title: 'Attendance', sub: 'Attendance Page', icon: 'bi-calendar-check-fill', color: '#cf222e', bg: '#fff1f0' },
  ot: { title: 'Overtime', sub: 'Overtime Page', icon: 'bi-clock-history', color: '#bc4c00', bg: '#fff1e5' },
};

export default function PlaceholderPage({ page }) {
  const config = pageConfigs[page] || { title: page, sub: `${page} Page`, icon: 'bi-file-earmark', color: '#57606a', bg: '#f6f8fa' };
  return (
    <div className="placeholder-page">
      <div className="placeholder-inner">
        <div className="page-icon" style={{ background: config.bg, color: config.color }}>
          <i className={`bi ${config.icon}`}></i>
        </div>
        <h2>{config.title}</h2>
        <p>{config.sub}</p>
        <div style={{ marginTop: 20 }}>
          <span style={{
            background: config.bg,
            color: config.color,
            padding: '6px 16px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600
          }}>
            Coming Soon
          </span>
        </div>
      </div>
    </div>
  );
}
