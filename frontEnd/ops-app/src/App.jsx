import {BrowserRouter,Navigate,Route,Routes} from "react-router-dom";
import {getCompanyId,getToken} from "./api/api";

import SignInPage from "./pages/SignInPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import SetupPage from "./pages/SetupPage";

import DashboardPage from "./pages/DashboardPage";
import PeoplePage from "./pages/PeoplePage";
import GovernancePage from "./pages/GovernancePage";
import OrganisationPage from "./pages/OrganisationPage";
import SettingsPage from "./pages/SettingsPage";

import RequestsPage from "./pages/RequestsPage";
import RequestPage from "./pages/RequestPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import BudgetPage from "./pages/BudgetPage";
import QuoteEvaluationPage from "./pages/QuoteEvaluationPage";

import ProcurementPage from "./pages/ProcurementPage";
import ProcurementPoliciesPage from "./pages/ProcurementPoliciesPage";
import ProcurementVendorsPage from "./pages/ProcurementVendorsPage";
import ProcurementSettingsPage from "./pages/ProcurementSettingsPage";
import ProcurementCasePage from "./pages/ProcurementCasePage";
import AwardPage from "./pages/AwardPage";
import PurchaseOrderPage from "./pages/PurchaseOrderPage";
import ReceiptPage from "./pages/ReceiptPage";
import ReturnsPage from "./pages/ReturnsPage";
import ContractsPage from "./pages/ContractsPage";
import ProcurementDashboardPage from "./pages/ProcurementDashboardPage";

import VendorInvoicePage from "./pages/VendorInvoicePage";
import PayablesQueuePage from "./pages/PayablesQueuePage";

import FinanceOverviewPage from "./pages/FinanceOverviewPage";
import FinanceMyWorkPage from "./pages/FinanceMyWorkPage";
import PaymentVoucherPage from "./pages/PaymentVoucherPage";
import PaymentVouchersPage from "./pages/PaymentVouchersPage";

import CompanyEmailSettingsPage from "./pages/CompanyEmailSettingsPage";

function Protected({children}){
  if(!getToken()||!getCompanyId()) return <Navigate to="/signin" replace/>;
  return children;
}

export default function App(){
  const basename=import.meta.env.PROD?"/app/ops":"/";

  return(
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/signin" element={<SignInPage/>}/>
        <Route path="/accept-invite" element={<AcceptInvitePage/>}/>
        <Route path="/ops/accept-invite" element={<AcceptInvitePage/>}/>
        <Route path="/" element={<Protected><DashboardPage/></Protected>}/>

        <Route path="/setup" element={<Protected><SetupPage/></Protected>}/>

        <Route path="/people" element={<Protected><PeoplePage/></Protected>}/>
        <Route path="/organisation" element={<Protected><OrganisationPage/></Protected>}/>
        <Route path="/governance" element={<Protected><GovernancePage/></Protected>}/>

        <Route path="/requests" element={<Protected><RequestsPage/></Protected>}/>
        <Route path="/requests/new" element={<Protected><RequestPage/></Protected>}/>
        <Route path="/requests/:requestId" element={<Protected><RequestPage/></Protected>}/>

        <Route path="/approvals" element={<Protected><ApprovalsPage/></Protected>}/>
        <Route path="/budget" element={<Protected><BudgetPage/></Protected>}/>

        <Route path="/procurement" element={<Protected><ProcurementPage/></Protected>}/>
        <Route path="/procurement/policies" element={<Protected><ProcurementPoliciesPage/></Protected>}/>
        <Route path="/procurement/vendors" element={<Protected><ProcurementVendorsPage/></Protected>}/>
        <Route path="/procurement/settings" element={<Protected><ProcurementSettingsPage/></Protected>}/>
        <Route path="/procurement/:caseId/evaluation" element={<Protected><QuoteEvaluationPage/></Protected>}/>
        <Route path="/procurement/:caseId/award" element={<Protected><AwardPage/></Protected>}/>
        <Route path="/procurement/:caseId/purchase-order/:poId" element={<Protected><PurchaseOrderPage/></Protected>}/>
        <Route path="/procurement/:caseId/receipts/:receiptId" element={<Protected><ReceiptPage/></Protected>}/>
        
        {/* Phase 5 - Returns, Contracts, Dashboard */}
        <Route path="/procurement/receipts/:receiptId/returns" element={<Protected><ReturnsPage/></Protected>}/>
        <Route path="/procurement/receipts/:receiptId/returns/:returnId" element={<Protected><ReturnsPage/></Protected>}/>
        <Route path="/procurement/contracts" element={<Protected><ContractsPage/></Protected>}/>
        <Route path="/procurement/contracts/:contractId" element={<Protected><ContractsPage/></Protected>}/>
        <Route path="/procurement/dashboard" element={<Protected><ProcurementDashboardPage/></Protected>}/>

        <Route path="/accounts-payable/invoices/:invoiceId" element={<Protected><VendorInvoicePage/></Protected>}/>

        <Route path="/finance" element={<Protected><FinanceOverviewPage/></Protected>}/>
        <Route path="/finance/my-work" element={<Protected><FinanceMyWorkPage/></Protected>}/>
        <Route path="/finance/payables/invoices" element={<Protected><PayablesQueuePage queue="inbox"/></Protected>}/>
        <Route path="/finance/payables/matching" element={<Protected><PayablesQueuePage queue="matching"/></Protected>}/>
        <Route path="/finance/payables/exceptions" element={<Protected><PayablesQueuePage queue="exceptions"/></Protected>}/>
        <Route path="/finance/payables/ready" element={<Protected><PayablesQueuePage queue="ready"/></Protected>}/>
        <Route path="/finance/payables/invoices/:invoiceId" element={<Protected><VendorInvoicePage/></Protected>}/>
        <Route path="/finance/payables/invoices/:invoiceId/payment-voucher" element={<Protected><PaymentVoucherPage/></Protected>}/>
        <Route path="/finance/payables/payment-vouchers" element={<Protected><PaymentVouchersPage/></Protected>}/>

        <Route path="/settings/company" element={<Protected><SettingsPage section="company"/></Protected>}/>
        <Route path="/settings/email" element={<Protected><SettingsPage section="email"/></Protected>}/>
        <Route path="/settings/users" element={<Protected><SettingsPage section="users"/></Protected>}/>
        <Route path="/settings" element={<Protected><SettingsPage/></Protected>}/>
        <Route path="/procurement/:caseId" element={<Protected><ProcurementCasePage/></Protected>}/>
        <Route path="/sourcing/:eventId" element={<Protected><ProcurementCasePage/></Protected>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </BrowserRouter>
  );
}