import {useEffect,useMemo,useState} from "react";
import {ArrowRight,CheckCircle2,Clock3,FileText,Plus,Search} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {getCompanyId,portalApi} from "../api/api";
import PortalShell from "../components/PortalShell";

const money=(v,c="")=>`${c||""} ${Number(v||0).toLocaleString(undefined,{
  minimumFractionDigits:2,
  maximumFractionDigits:2
})}`.trim();

export default function InvoicesPage(){
  const companyId=getCompanyId();
  const nav=useNavigate();

  const [session,setSession]=useState(null);
  const [rows,setRows]=useState([]);
  const [orders,setOrders]=useState([]);
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("");
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const [form,setForm]=useState({
    purchase_order_id:"",
    supplier_invoice_no:"",
    invoice_date:"",
    due_date:"",
    tax_amount:"",
    description:""
  });

  const set=(k,v)=>setForm(x=>({...x,[k]:v}));

  async function load(){
    const [ctx,invoiceData,poData]=await Promise.all([
      portalApi.session(companyId),
      portalApi.invoices(companyId),
      portalApi.purchaseOrders(companyId)
    ]);

    setSession(ctx);
    setRows(invoiceData.rows||[]);
    setOrders(
      (poData.rows||[]).filter(po=>
        po.vendor_acknowledgement_status==="accepted"
        &&["acknowledged","partially_received","received"].includes(po.status)
      )
    );
  }

  useEffect(()=>{
    load().catch(err=>setError(err.message));
  },[]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();

    return rows.filter(row=>{
      if(status&&row.status!==status) return false;
      if(!q) return true;

      return [
        row.invoice_no,
        row.supplier_invoice_no,
        row.po_no,
        row.status
      ].some(v=>String(v||"").toLowerCase().includes(q));
    });
  },[rows,search,status]);

  async function createInvoice(e){
    e.preventDefault();

    if(!form.purchase_order_id){
      setError("Choose a purchase order.");
      return;
    }

    if(!form.supplier_invoice_no.trim()){
      setError("Supplier invoice number is required.");
      return;
    }

    if(!form.invoice_date){
      setError("Invoice date is required.");
      return;
    }

    setBusy(true);
    setError("");

    try{
      const po=await portalApi.purchaseOrder(
        companyId,
        form.purchase_order_id
      );

      const order=po.purchase_order;
      const lines=po.lines||[];

      const payload={
        supplier_invoice_no:form.supplier_invoice_no.trim(),
        invoice_date:form.invoice_date,
        due_date:form.due_date||null,
        subtotal:Number(order.subtotal||0),
        discount_amount:Number(order.discount_amount||0),
        tax_amount:Number(form.tax_amount||order.tax_amount||0),
        total_amount:
          Number(order.subtotal||0)
          -Number(order.discount_amount||0)
          +Number(form.tax_amount||order.tax_amount||0)
          +Number(order.delivery_amount||0),
        supplier_reference:order.supplier_reference||null,
        description:form.description.trim()||null,
        lines:lines.map(line=>({
          purchase_order_line_id:line.id,
          description:line.description,
          quantity:Number(
            Number(line.quantity||0)
            -Number(line.received_quantity||0)
            >0
              ?line.received_quantity||line.quantity||0
              :line.quantity||0
          ),
          unit_price:Number(line.unit_price||0),
          discount_amount:Number(line.line_discount||0),
          tax_amount:Number(line.tax_amount||0),
          line_total:Number(line.line_total||0)
        }))
      };

      const invoice=await portalApi.createInvoice(
        companyId,
        form.purchase_order_id,
        payload
      );

      setOpen(false);

      setForm({
        purchase_order_id:"",
        supplier_invoice_no:"",
        invoice_date:"",
        due_date:"",
        tax_amount:"",
        description:""
      });

      nav(`/invoices/${invoice.id}`);

    }catch(err){
      setError(err.message);
    }finally{
      setBusy(false);
    }
  }

  if(!session)
    return <div className="portal-loading">Loading invoices…</div>;

  return (
    <PortalShell session={session} active="invoices">
      <div className="vendor-portal-page-header">
        <div>
          <span className="portal-eyebrow">BILLING</span>
          <h1>Invoices</h1>
          <p>Submit supplier invoices against purchase orders issued by your customer.</p>
        </div>

        <button type="button" className="portal-primary" onClick={()=>setOpen(true)}>
          <Plus size={16}/>
          Create invoice
        </button>
      </div>

      {error&&<div className="portal-alert error">{error}</div>}

      <div className="vendor-po-stat-grid">
        <article className="vendor-po-stat">
          <FileText size={18}/>
          <div><span>Total invoices</span><strong>{rows.length}</strong></div>
        </article>

        <article className="vendor-po-stat">
          <Clock3 size={18}/>
          <div>
            <span>Under review</span>
            <strong>{rows.filter(x=>["submitted","under_review"].includes(x.status)).length}</strong>
          </div>
        </article>

        <article className="vendor-po-stat">
          <CheckCircle2 size={18}/>
          <div>
            <span>Accepted</span>
            <strong>{rows.filter(x=>x.status==="accepted").length}</strong>
          </div>
        </article>
      </div>

      <section className="vendor-po-workspace">
        <div className="vendor-po-toolbar">
          <div className="vendor-po-search">
            <Search size={16}/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search invoice or PO"/>
          </div>

          <select value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="">All invoices</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under review</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {!filtered.length?(
          <div className="vendor-empty">
            <FileText/>
            <h3>No invoices yet</h3>
            <p>Your submitted supplier invoices will appear here.</p>
          </div>
        ):(
          <div className="vendor-po-list">
            {filtered.map(row=>(
              <button type="button" className="vendor-po-row" key={row.id}
                onClick={()=>nav(`/invoices/${row.id}`)}>

                <div className="vendor-po-row-icon">
                  <FileText size={17}/>
                </div>

                <div className="vendor-po-row-main">
                  <span>{row.invoice_no}</span>
                  <strong>{row.supplier_invoice_no}</strong>
                  <small>{row.po_no||"No PO"}</small>
                </div>

                <div className="vendor-po-row-date">
                  <span>Invoice date</span>
                  <strong>
                    {row.invoice_date
                      ?new Date(row.invoice_date).toLocaleDateString()
                      :"—"}
                  </strong>
                </div>

                <div className="vendor-po-row-amount">
                  <span>Amount</span>
                  <strong>{money(row.total_amount,row.currency_code)}</strong>
                </div>

                <span className={`portal-status ${row.status}`}>
                  {row.status.replaceAll("_"," ")}
                </span>

                <ArrowRight size={16}/>
              </button>
            ))}
          </div>
        )}
      </section>

      {open&&(
        <div className="portal-modal-backdrop" onMouseDown={()=>setOpen(false)}>
          <form className="portal-modal vendor-invoice-create-modal"
            onSubmit={createInvoice}
            onMouseDown={e=>e.stopPropagation()}>

            <FileText size={24}/>
            <h2>Create supplier invoice</h2>
            <p>Select the purchase order this invoice relates to. Order lines will be prefilled from the PO.</p>

            <label>Purchase order</label>
            <select value={form.purchase_order_id}
              onChange={e=>set("purchase_order_id",e.target.value)}
              required>
              <option value="">Select purchase order</option>
              {orders.map(po=>(
                <option key={po.id} value={po.id}>
                  {po.po_no} · {money(po.total_amount,po.currency_code)}
                </option>
              ))}
            </select>

            <label>Supplier invoice number</label>
            <input value={form.supplier_invoice_no}
              onChange={e=>set("supplier_invoice_no",e.target.value)}
              placeholder="INV-2026-001"
              required/>

            <div className="portal-two-col">
              <div>
                <label>Invoice date</label>
                <input type="date" value={form.invoice_date}
                  onChange={e=>set("invoice_date",e.target.value)}
                  required/>
              </div>

              <div>
                <label>Due date</label>
                <input type="date" value={form.due_date}
                  onChange={e=>set("due_date",e.target.value)}/>
              </div>
            </div>

            <label>Tax amount</label>
            <input type="number" min="0" step="0.01"
              value={form.tax_amount}
              onChange={e=>set("tax_amount",e.target.value)}/>

            <label>Description</label>
            <textarea rows="4" value={form.description}
              onChange={e=>set("description",e.target.value)}
              placeholder="Optional invoice description..."/>

            <div className="portal-modal-actions">
              <button type="button" className="portal-secondary"
                onClick={()=>setOpen(false)} disabled={busy}>
                Cancel
              </button>

              <button type="submit" className="portal-primary" disabled={busy}>
                {busy?"Creating...":"Create invoice"}
              </button>
            </div>
          </form>
        </div>
      )}
    </PortalShell>
  );
}