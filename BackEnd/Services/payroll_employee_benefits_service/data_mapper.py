"""
PAYE Tax Filing Integration Layer
==================================
Maps your existing FinSage payroll database schema to the tax filing export format.

This module bridges your current payroll infrastructure with the SARS/RSL/BURS
compliant export system.

Author: Integration Module for Payroll System
"""

from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, TypedDict
import json


# ============================================================================
# TYPE DEFINITIONS (Matches your DB schema)
# ============================================================================

class TaxRegime(TypedDict):
    id: int
    authority_code: str  # 'SARS', 'RSL', 'BURS'
    country_code: str   # 'ZA', 'LS', 'BW'
    name: str
    currency: str       # 'ZAR', 'LSL', 'BWP'
    is_active: bool


class TaxYear(TypedDict):
    id: int
    regime_id: int
    tax_year_label: str
    effective_from: date
    effective_to: date
    calculation_basis: str  # 'annualised', 'monthly_table', 'periodic_table'
    is_active: bool


class TaxBracket(TypedDict):
    id: int
    tax_year_id: int
    residency_status: str  # 'resident', 'non_resident'
    lower_bound: Decimal
    upper_bound: Optional[Decimal]
    base_tax: Decimal
    marginal_rate: Decimal  # Stored as decimal (e.g., 0.18 for 18%)
    excess_over: Decimal
    sort_order: int


class TaxParameter(TypedDict):
    id: int
    tax_year_id: int
    parameter_key: str
    numeric_value: Optional[Decimal]
    text_value: Optional[str]
    json_value: Optional[Dict]


# ============================================================================
# EMPLOYEE RECORD FROM YOUR PAYROLL SYSTEM
# ============================================================================

class PayrollEmployeeRecord(TypedDict):
    """
    Represents an employee record from your existing payroll tables.
    Adjust field names to match your actual schema.
    """
    # Basic identification
    employee_id: str
    payroll_number: Optional[str]
    first_name: str
    last_name: str
    id_number: str           # ID/Passport/Tax number
    date_of_birth: Optional[date]
    
    # Employment
    employment_start_date: Optional[date]
    employment_end_date: Optional[date]
    job_title: Optional[str]
    department: Optional[str]
    tax_number: Optional[str]  # Specific tax reference if different from ID
    
    # Period earnings (for specific pay period)
    basic_salary: Decimal
    overtime_pay: Decimal
    bonus: Decimal
    commission: Decimal
    allowances: Decimal
    other_income: Decimal
    gross_income: Decimal
    
    # Deductions
    paye_deducted: Decimal
    uif_deducted: Optional[Decimal]      # South Africa only
    sdl_deducted: Optional[Decimal]      # South Africa only
    pension_fund_contributions: Decimal
    retirement_annuity_contributions: Decimal
    medical_scheme_contributions: Decimal
    other_deductions: Decimal
    
    # Benefits/Fringe benefits (from your employee_benefits_service)
    fringe_benefits_total: Optional[Decimal]
    company_vehicle_value: Optional[Decimal]
    vehicle_private_use_pct: Optional[int]
    accommodation_value: Optional[Decimal]
    
    # Calculated
    net_pay: Decimal
    
    # Period info
    period_start_date: date
    period_end_date: date
    payment_date: date
    
    # Flags
    is_director: bool
    is_non_resident: bool
    has_disability: bool
    is_age_65_plus: bool
    is_age_75_plus: bool


# ============================================================================
# MAPPING CONFIGURATION
# ============================================================================

AUTHORITY_MAPPING = {
    'SARS': {
        'authority_code': 'SARS',
        'name': 'South African Revenue Service',
        'country_code': 'ZA',
        'currency': 'ZAR',
        'monthly_return_name': 'EMP201',
        'annual_return_name': 'EMP501/IRP5',
        'tax_year_start_month': 3,
        'supports_xml': True,
        'id_number_pattern': r'^\d{13}$',
        'required_fields': [
            'employee_id', 'first_name', 'last_name', 'id_number',
            'gross_income', 'paye_deducted', 'period_start_date', 'period_end_date'
        ],
        'optional_fields': [
            'tax_number', 'uif_deducted', 'sdl_deducted',
            'fringe_benefits_total', 'pension_fund_contributions',
            'medical_scheme_contributions'
        ]
    },
    'RSL': {
        'authority_code': 'RSL',
        'name': 'Revenue Services Lesotho',
        'country_code': 'LS',
        'currency': 'LSL',
        'monthly_return_name': 'EMP160',
        'annual_return_name': 'EMP500',
        'tax_year_start_month': 4,
        'supports_xml': False,
        'id_number_pattern': r'^[A-Z0-9]{5,15}$',
        'required_fields': [
            'employee_id', 'first_name', 'last_name', 'id_number',
            'basic_salary', 'paye_deducted', 'period_start_date', 'period_end_date'
        ],
        'optional_fields': [
            'allowances', 'bonus', 'commission', 'other_income',
            'pension_fund_contributions', 'other_deductions'
        ]
    },
    'BURS': {
        'authority_code': 'BURS',
        'name': 'Botswana Unified Revenue Service',
        'country_code': 'BW',
        'currency': 'BWP',
        'monthly_return_name': 'ITP1',
        'annual_return_name': 'ITP2',
        'tax_year_start_month': 7,
        'supports_xml': False,
        'id_number_pattern': r'^(\d{6,12}|[A-Z]{1,2}\d{6,9})$',
        'required_fields': [
            'employee_id', 'first_name', 'last_name', 'id_number',
            'basic_salary', 'paye_deducted', 'period_start_date', 'period_end_date'
        ],
        'optional_fields': [
            'overtime_pay', 'allowances', 'bonus', 'commission',
            'fringe_benefits_total', 'pension_fund_contributions',
            'medical_scheme_contributions'
        ]
    }
}
# ============================================================================
# DATA TRANSFORMATION FUNCTIONS
# ============================================================================

def dec(value: Any) -> Decimal:
    """Convert value to Decimal safely."""
    if value in (None, '', 'None'):
        return Decimal('0')
    return Decimal(str(value))


def money(value: Any, precision: int = 2) -> Decimal:
    """Convert to monetary Decimal with specified precision."""
    return dec(value).quantize(Decimal(10) ** -precision, rounding=ROUND_HALF_UP)


def format_date(d: Optional[date]) -> str:
    """Format date as ISO string."""
    if not d:
        return ''
    return d.isoformat() if isinstance(d, date) else str(d)


def mask_id_number(id_number: str) -> str:
    """Mask ID number for privacy in previews."""
    if not id_number or len(id_number) <= 6:
        return id_number or ''
    return id_number[:3] + '****' + id_number[-3:]


# ============================================================================
# MAIN MAPPING FUNCTION: Your Payroll Record → Export Format
# ============================================================================

def map_employee_to_export_record(
    emp: PayrollEmployeeRecord,
    authority_code: str,
    employer_info: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Transform a payroll employee record into the format required for tax filing export.
    
    Args:
        emp: Employee record from your payroll system
        authority_code: 'SARS', 'RSL', or 'BURS'
        employer_info: Company information dict
        
    Returns:
        Dict suitable for CSV/XML/XLSX generation
    """
    config = AUTHORITY_MAPPING.get(authority_code)
    if not config:
        raise ValueError(f"Unsupported authority code: {authority_code}")
    
    # Base record structure (common fields)
    record = {
        # Employer Info
        'employer_tax_reference': employer_info.get('tax_reference_number', ''),
        'employer_name': employer_info.get('name', ''),
        'employer_registration_number': employer_info.get('registration_number', ''),
        
        # Employee Identity
        'employee_id': emp.get('employee_id', ''),
        'payroll_number': emp.get('payroll_number', ''),
        'first_name': emp.get('first_name', ''),
        'last_name': emp.get('last_name', ''),
        'full_name': f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip(),
        'id_number': emp.get('id_number', ''),
        'masked_id_number': mask_id_number(emp.get('id_number', '')),
        'tax_number': emp.get('tax_number', '') or emp.get('id_number', ''),
        
        # Period Information
        'period_start_date': format_date(emp.get('period_start_date')),
        'period_end_date': format_date(emp.get('period_end_date')),
        'payment_date': format_date(emp.get('payment_date')),
        
        # Income Components
        'basic_salary': float(money(emp.get('basic_salary', 0))),
        'overtime_pay': float(money(emp.get('overtime_pay', 0))),
        'bonus': float(money(emp.get('bonus', 0))),
        'commission': float(money(emp.get('commission', 0))),
        'allowances': float(money(emp.get('allowances', 0))),
        'other_income': float(money(emp.get('other_income', 0))),
        'gross_income': float(money(emp.get('gross_income', 0))),
        
        # Deductions
        'paye_deducted': float(money(emp.get('paye_deducted', 0))),
        'uif_deducted': float(money(emp.get('uif_deducted', 0))) if emp.get('uif_deducted') else None,
        'sdl_deducted': float(money(emp.get('sdl_deducted', 0))) if emp.get('sdl_deducted') else None,
        'pension_fund_contributions': float(money(emp.get('pension_fund_contributions', 0))),
        'retirement_annuity_contributions': float(money(emp.get('retirement_annuity_contributions', 0))),
        'medical_scheme_contributions': float(money(emp.get('medical_scheme_contributions', 0))),
        'other_deductions': float(money(emp.get('other_deductions', 0))),
        
        # Fringe Benefits
        'fringe_benefits_total': float(money(emp.get('fringe_benefits_total', 0))) if emp.get('fringe_benefits_total') else None,
        'company_vehicle_value': float(money(emp.get('company_vehicle_value', 0))) if emp.get('company_vehicle_value') else None,
        'vehicle_private_use_percentage': emp.get('vehicle_private_use_pct'),
        'accommodation_value': float(money(emp.get('accommodation_value', 0))) if emp.get('accommodation_value') else None,
        
        # Net Pay
        'net_pay': float(money(emp.get('net_pay', 0))),
        
        # Flags
        'is_director': emp.get('is_director', False),
        'is_non_resident': emp.get('is_non_resident', False),
        'is_age_65_plus': emp.get('is_age_65_plus', False),
        'is_age_75_plus': emp.get('is_age_75_plus', False),
        
        # Authority-specific formatting
        '_authority_code': authority_code,
        '_currency': config['currency'],
        '_return_type': config['monthly_return_name'],
    }
    
    # Authority-specific transformations
    if authority_code == 'SARS':
        record.update(_map_sars_specifics(emp))
    elif authority_code == 'RSL':
        record.update(_map_rsl_specifics(emp))
    elif authority_code == 'BURS':
        record.update(_map_burs_specifics(emp))
    
    return record


def _map_sars_specifics(emp: PayrollEmployeeRecord) -> Dict[str, Any]:
    """SARS-specific field mappings (IRP5 codes)."""
    return {
        # IRP5 Source Codes
        'code_3601_total_remuneration': float(money(emp.get('gross_income', 0))),
        'code_3602_cash_income': float(money(emp.get('basic_salary', 0)) + money(emp.get('overtime_pay', 0))),
        'code_3603_allowances': float(money(emp.get('allowances', 0))),
        'code_3604_bonuses_overtime': float(money(emp.get('bonus', 0)) + money(emp.get('overtime_pay', 0))),
        'code_3605_commission': float(money(emp.get('commission', 0))),
        
        # Deduction Codes
        'code_3801_pension_fund': float(money(emp.get('pension_fund_contributions', 0))),
        'code_3802_retirement_annuity': float(money(emp.get('retirement_annuity_contributions', 0))),
        'code_3811_medical_scheme_contrib': float(money(emp.get('medical_scheme_contributions', 0))),
        
        # Benefit Codes
        'code_7001_company_vehicle': float(money(emp.get('company_vehicle_value', 0))) if emp.get('company_vehicle_value') else None,
        'code_7002_accommodation': float(money(emp.get('accommodation_value', 0))) if emp.get('accommodation_value') else None,
        
        # Period formatted for EMP201
        'emp201_period': _format_emp201_period(emp.get('period_end_date')),
    }


def _map_rsl_specifics(emp: PayrollEmployeeRecord) -> Dict[str, Any]:
    """RSL Lesotho-specific field mappings."""
    period_end = emp.get('period_end_date')
    return {
        'rsl_period': f"{period_end.strftime('%m/%Y')}" if period_end else '',
        'rsl_month_name': period_end.strftime('%B') if period_end else '',
        'rsl_year': period_end.year if period_end else None,
        'tin_number': emp.get('tax_number') or emp.get('id_number', ''),
        'total_earnings': float(money(emp.get('gross_income', 0))),
        'paye_withheld': float(money(emp.get('paye_deducted', 0))),
    }


def _map_burs_specifics(emp: PayrollEmployeeRecord) -> Dict[str, Any]:
    """BURS Botswana-specific field mappings."""
    period_end = emp.get('period_end_date')
    return {
        'burs_period': period_end.strftime('%Y-%m') if period_end else '',
        'id_passport_number': emp.get('id_number', ''),
        'tax_pin': emp.get('tax_number', ''),
        'benefits_in_kind': float(money(emp.get('fringe_benefits_total', 0))) if emp.get('fringe_benefits_total') else None,
        'gross_emoluments': float(money(emp.get('gross_income', 0))),
        'snpf_contribution': float(money(emp.get('pension_fund_contributions', 0))),  # Map pension to SNPF
        'medical_aid': float(money(emp.get('medical_scheme_contributions', 0))),
    }


def _format_emp201_period(period_end: Optional[date]) -> str:
    """Format period as YYYYMM for SARS EMP201."""
    if not period_end:
        return ''
    return period_end.strftime('%Y%m')


# ============================================================================
# BATCH PROCESSING
# ============================================================================

def map_batch_for_export(
    employees: List[PayrollEmployeeRecord],
    authority_code: str,
    employer_info: Dict[str, Any],
    period_start: date,
    period_end: date
) -> Dict[str, Any]:
    """
    Process a batch of employees for tax filing export.
    
    Returns:
        Dict containing:
        - records: List of mapped employee records
        - summary: Totals and statistics
        - metadata: Export metadata
    """
    config = AUTHORITY_MAPPING.get(authority_code)
    if not config:
        raise ValueError(f"Unsupported authority: {authority_code}")
    
    # Map all employees
    records = [map_employee_to_export_record(emp, authority_code, employer_info) 
               for emp in employees]
    
    # Calculate summary totals
    total_gross = sum(r['gross_income'] for r in records)
    total_paye = sum(r['paye_deducted'] for r in records)
    total_uif = sum(r.get('uif_deducted', 0) or 0 for r in records)
    total_sdl = sum(r.get('sdl_deducted', 0) or 0 for r in records)
    total_net = sum(r['net_pay'] for r in records)
    
    summary = {
        'authority_code': authority_code,
        'authority_name': config['name'],
        'country_code': config['country_code'],
        'currency': config['currency'],
        'return_type': config['monthly_return_name'],
        'period_start': format_date(period_start),
        'period_end': format_date(period_end),
        'total_employees': len(records),
        'total_gross_income': float(total_gross),
        'total_paye_deducted': float(total_paye),
        'total_uif_deducted': float(total_uif),
        'total_sdl_deducted': float(total_sdl),
        'total_net_pay': float(total_net),
        'average_tax_rate': float((total_paye / total_gross * 100) if total_gross > 0 else 0),
        'generated_at': datetime.utcnow().isoformat(),
    }
    
    return {
        'records': records,
        'summary': summary,
        'metadata': {
            'export_version': '1.0.0',
            'source_system': 'FinSage Payroll',
            'authority_config': config,
        }
    }


# ============================================================================
# VALIDATION HELPERS (Integration with your existing validation)
# ============================================================================

def validate_for_authority(
    record: Dict[str, Any],
    authority_code: str
) -> List[Dict[str, Any]]:
    """
    Validate a single record against authority requirements.
    Returns list of validation issues (empty if valid).
    """
    issues = []
    config = AUTHORITY_MAPPING.get(authority_code, {})
    required_fields = config.get('required_fields', [])
    
    # Check required fields
    for field in required_fields:
        value = record.get(field)
        if value is None or value == '' or (isinstance(value, (int, float)) and value == 0 and field != 'paye_deducted'):
            issues.append({
                'severity': 'error',
                'field': field,
                'message': f"Required field '{field}' is missing or empty",
                'authority': authority_code
            })
    
    # Authority-specific validations
    if authority_code == 'SARS':
        issues.extend(_validate_sars_rules(record))
    elif authority_code == 'RSL':
        issues.extend(_validate_rsl_rules(record))
    elif authority_code == 'BURS':
        issues.extend(_validate_burs_rules(record))
    
    return issues


def _validate_sars_rules(record: Dict) -> List[Dict]:
    """SARS-specific validation rules."""
    issues = []
    id_num = record.get('id_number', '')
    
    # SA ID must be 13 digits
    if id_num and not (len(id_num) == 13 and id_num.isdigit()):
        issues.append({
            'severity': 'warning',
            'field': 'id_number',
            'message': "South African ID should be 13 digits",
            'authority': 'SARS'
        })
    
    # UIF cap check
    uif = record.get('uif_deducted')
    if uif and uif > 177.12:
        issues.append({
            'severity': 'warning',
            'field': 'uif_deducted',
            'message': f"UIF contribution (R{uif:.2f}) exceeds monthly cap of R177.12",
            'authority': 'SARS'
        })
    
    return issues


def _validate_rsl_rules(record: Dict) -> List[Dict]:
    """RSL-specific validation rules."""
    issues = []
    # Add RSL-specific rules here
    return issues


def _validate_burs_rules(record: Dict) -> List[Dict]:
    """BURS-specific validation rules."""
    issues = []
    # Add BURS-specific rules here
    return issues


# ============================================================================
# UTILITY FUNCTIONS FOR YOUR EXISTING SERVICE LAYER
# ============================================================================

def get_authority_options_from_db(tax_regimes: List[TaxRegime]) -> List[Dict]:
    """
    Convert your DB tax regimes to dropdown options for the UI.
    """
    return [
        {
            'value': regime['authority_code'],
            'label': f"{regime['name']} ({regime['country_code']})",
            'currency': regime['currency'],
            'country_code': regime['country_code']
        }
        for regime in tax_regimes
        if regime.get('is_active', True) and regime['authority_code'] in AUTHORITY_MAPPING
    ]


def generate_export_filename(
    authority_code: str,
    period_end: date,
    format_type: str = 'csv'
) -> str:
    """Generate a standardized filename for exports."""
    config = AUTHORITY_MAPPING.get(authority_code, {})
    return f"{authority_code}_PAYE_{config.get('monthly_return_name', 'Return')}_{period_end.strftime('%Y%m%d')}.{format_type}"


# ============================================================================
# EXAMPLE USAGE / INTEGRATION POINTS
# ============================================================================

"""
INTEGRATION EXAMPLE WITH YOUR EXISTING db_service:

def get_payroll_records_for_filing(
    self,
    company_id: int,
    period_start: date,
    period_end: date,
    authority_code: str
) -> List[PayrollEmployeeRecord]:
    '''
    Query your existing payroll tables and return records in the expected format.
    This would go in your db_service.py or a new method.
    '''
    schema = self.company_schema(company_id)
    
    query = f'''
        SELECT 
            e.employee_id,
            e.payroll_number,
            e.first_name,
            e.last_name,
            e.id_number,
            e.tax_number,
            e.date_of_birth,
            e.employment_start_date,
            e.job_title,
            e.department,
            
            -- Earnings for this period
            COALESCE(pe.basic_salary, 0) AS basic_salary,
            COALESCE(pe.overtime_pay, 0) AS overtime_pay,
            COALESCE(pe.bonus, 0) AS bonus,
            COALESCE(pe.commission, 0) AS commission,
            COALESCE(pe.allowances, 0) AS allowances,
            COALESCE(pe.other_income, 0) AS other_income,
            COALESCE(pe.gross_income, 0) AS gross_income,
            
            -- Deductions
            COALESCE(pd.paye_deducted, 0) AS paye_deducted,
            COALESCE(pd.uif_deducted, 0) AS uif_deducted,
            COALESCE(pd.sdl_deducted, 0) AS sdl_deducted,
            COALESCE(pd.pension_fund, 0) AS pension_fund_contributions,
            COALESCE(pd.medical_scheme, 0) AS medical_scheme_contributions,
            COALESCE(pd.other_deductions, 0) AS other_deductions,
            
            -- Calculated
            COALESCE(pe.net_pay, 0) AS net_pay,
            
            -- Period
            %s AS period_start_date,
            %s AS period_end_date,
            pe.payment_date,
            
            -- Flags
            COALESCE(e.is_director, false) AS is_director,
            COALESCE(e.is_non_resident, false) AS is_non_resident
            
        FROM {schema}.employees e
        JOIN {schema}.payroll_earnings pe ON pe.employee_id = e.id
        JOIN {schema}.payroll_deductions pd ON pd.employee_id = e.id
            AND pd.period_start = %s
            AND pd.period_end = %s
        WHERE e.is_active = true
            AND pe.period_start = %s
            AND pe.period_end = %s
        ORDER BY e.payroll_number
    '''
    
    return self._payroll_query(
        query, 
        (period_start, period_end, period_start, period_end, period_start, period_end)
    )
"""
