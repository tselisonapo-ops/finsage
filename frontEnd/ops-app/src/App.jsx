import {BrowserRouter,Navigate,Route,Routes} from "react-router-dom";
import {getCompanyId,getToken} from "./api/api";
import SignInPage from "./pages/SignInPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import SetupPage from "./pages/SetupPage";
import DashboardPage from "./pages/DashboardPage";
import RequestsPage from "./pages/RequestsPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import BudgetPage from "./pages/BudgetPage";
import RequestPage from "./pages/RequestPage";


function Protected({children}){
  if(!getToken()||!getCompanyId()) return <Navigate to="/signin" replace/>;
  return children;
}

export default function App(){
  const basename=import.meta.env.PROD?"/ops":"/";

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/signin" element={<SignInPage/>}/>
        <Route path="/accept-invite" element={<AcceptInvitePage/>}/>
        <Route path="/setup" element={<Protected><SetupPage/></Protected>}/>
        <Route path="/" element={<Protected><DashboardPage/></Protected>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
        <Route path="/requests" element={<Protected> <RequestsPage/> </Protected>}/>
        <Route path="/approvals" element={<Protected> <ApprovalsPage/> </Protected>}/>
        <Route path="/budget" element={ <Protected> <BudgetPage/> </Protected>}/>
        <Route path="/budget" element={<Protected><BudgetPage/></Protected>}/>
        <Route path="/requests" element={<Protected><RequestsPage/></Protected>}/>
        <Route path="/requests/new" element={<Protected><RequestPage/></Protected>}/>
        <Route path="/requests/:requestId" element={<Protected><RequestPage/></Protected>}/>        
      </Routes>
    </BrowserRouter>
  );
}