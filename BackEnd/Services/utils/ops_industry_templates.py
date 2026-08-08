OPS_ORG_TEMPLATE_VERSION=1

OPS_BASE_DEPARTMENTS=[
    {
        "code":"EXEC",
        "name":"Executive",
        "positions":[
            ("CEO","Chief Executive Officer",100,True),
            ("EXEC_ASSIST","Executive Assistant",30,False),
        ],
    },
    {
        "code":"FIN",
        "name":"Finance",
        "positions":[
            ("CFO","Chief Financial Officer",90,True),
            ("FIN_MGR","Finance Manager",75,False),
            ("ACCOUNTANT","Accountant",50,False),
            ("AP_CLERK","Accounts Payable Clerk",30,False),
            ("AR_CLERK","Accounts Receivable Clerk",30,False),
        ],
    },
    {
        "code":"PROC",
        "name":"Procurement",
        "positions":[
            ("PROC_MGR","Procurement Manager",70,True),
            ("PROC_OFFICER","Procurement Officer",40,False),
        ],
    },
]

OPS_INDUSTRY_DEPARTMENTS={
    "General Business":[
        {
            "code":"OPS",
            "name":"Operations",
            "positions":[
                ("OPS_MGR","Operations Manager",70,True),
                ("OPS_OFFICER","Operations Officer",40,False),
            ],
        },
        {
            "code":"SALES",
            "name":"Sales & Customer Service",
            "positions":[
                ("SALES_MGR","Sales Manager",65,True),
                ("SALES_OFFICER","Sales Officer",35,False),
            ],
        },
        {
            "code":"HR",
            "name":"Human Resources",
            "positions":[
                ("HR_MGR","HR Manager",65,True),
                ("HR_OFFICER","HR Officer",35,False),
            ],
        },
    ],

    "Professional Services":[
        {
            "code":"CLIENT",
            "name":"Client Services",
            "positions":[
                ("CLIENT_DIRECTOR","Client Services Director",75,True),
                ("ENGAGEMENT_MGR","Engagement Manager",60,False),
                ("CONSULTANT","Consultant",35,False),
            ],
        },
        {
            "code":"ADMIN",
            "name":"Administration",
            "positions":[
                ("ADMIN_MGR","Administration Manager",55,True),
                ("ADMIN_OFFICER","Administration Officer",30,False),
            ],
        },
        {
            "code":"HR",
            "name":"Human Resources",
            "positions":[
                ("HR_MGR","HR Manager",65,True),
                ("HR_OFFICER","HR Officer",35,False),
            ],
        },
    ],

    "Car Dealership":[
        {
            "code":"SALES",
            "name":"Vehicle Sales",
            "positions":[
                ("SALES_MGR","Sales Manager",70,True),
                ("SALES_EXEC","Sales Executive",35,False),
            ],
        },
        {
            "code":"AFTERSALES",
            "name":"Aftersales & Service",
            "positions":[
                ("AFTERSALES_MGR","Aftersales Manager",70,True),
                ("SERVICE_MGR","Service Manager",60,False),
                ("SERVICE_ADVISOR","Service Advisor",35,False),
            ],
        },
        {
            "code":"PARTS",
            "name":"Parts",
            "positions":[
                ("PARTS_MGR","Parts Manager",60,True),
                ("PARTS_OFFICER","Parts Officer",35,False),
            ],
        },
        {
            "code":"STOCK",
            "name":"Vehicle Stock & Logistics",
            "positions":[
                ("STOCK_MGR","Stock Manager",60,True),
                ("STOCK_CONTROLLER","Stock Controller",35,False),
            ],
        },
        {
            "code":"MARKETING",
            "name":"Marketing",
            "positions":[
                ("MARKETING_MGR","Marketing Manager",55,True),
                ("MARKETING_OFFICER","Marketing Officer",30,False),
            ],
        },
        {
            "code":"HR",
            "name":"Human Resources",
            "positions":[
                ("HR_MGR","HR Manager",65,True),
                ("HR_OFFICER","HR Officer",35,False),
            ],
        },
    ],

    "Retail & Wholesale":[
        {
            "code":"STORE_OPS",
            "name":"Store Operations",
            "positions":[
                ("AREA_MGR","Area Manager",70,True),
                ("STORE_MGR","Store Manager",55,False),
                ("SUPERVISOR","Supervisor",35,False),
            ],
        },
        {
            "code":"STOCK",
            "name":"Inventory & Warehousing",
            "positions":[
                ("WAREHOUSE_MGR","Warehouse Manager",60,True),
                ("STOCK_CONTROLLER","Stock Controller",35,False),
            ],
        },
        {
            "code":"SALES",
            "name":"Sales",
            "positions":[
                ("SALES_MGR","Sales Manager",60,True),
                ("SALES_OFFICER","Sales Officer",30,False),
            ],
        },
        {
            "code":"HR",
            "name":"Human Resources",
            "positions":[
                ("HR_MGR","HR Manager",65,True),
            ],
        },
    ],

    "Manufacturing":[
        {
            "code":"PROD",
            "name":"Production",
            "positions":[
                ("PROD_MGR","Production Manager",70,True),
                ("PROD_SUP","Production Supervisor",45,False),
            ],
        },
        {
            "code":"SUPPLY",
            "name":"Supply Chain",
            "positions":[
                ("SUPPLY_MGR","Supply Chain Manager",70,True),
                ("BUYER","Buyer",40,False),
            ],
        },
        {
            "code":"WAREHOUSE",
            "name":"Warehouse & Inventory",
            "positions":[
                ("WAREHOUSE_MGR","Warehouse Manager",60,True),
                ("STOCK_CONTROLLER","Stock Controller",35,False),
            ],
        },
        {
            "code":"QA",
            "name":"Quality",
            "positions":[
                ("QA_MGR","Quality Manager",65,True),
                ("QA_OFFICER","Quality Officer",35,False),
            ],
        },
        {
            "code":"MAINT",
            "name":"Engineering & Maintenance",
            "positions":[
                ("MAINT_MGR","Maintenance Manager",65,True),
                ("TECHNICIAN","Technician",30,False),
            ],
        },
        {
            "code":"HR",
            "name":"Human Resources",
            "positions":[
                ("HR_MGR","HR Manager",65,True),
            ],
        },
    ],

    "Construction":[
        {
            "code":"PROJECTS",
            "name":"Projects",
            "positions":[
                ("PROJECT_DIRECTOR","Project Director",80,True),
                ("PROJECT_MGR","Project Manager",65,False),
                ("SITE_MGR","Site Manager",50,False),
            ],
        },
        {
            "code":"QS",
            "name":"Commercial & Quantity Surveying",
            "positions":[
                ("COMMERCIAL_MGR","Commercial Manager",70,True),
                ("QS","Quantity Surveyor",45,False),
            ],
        },
        {
            "code":"SITE",
            "name":"Site Operations",
            "positions":[
                ("SITE_OPS_MGR","Site Operations Manager",60,True),
                ("FOREMAN","Foreman",35,False),
            ],
        },
        {
            "code":"HSE",
            "name":"Health, Safety & Environment",
            "positions":[
                ("HSE_MGR","HSE Manager",65,True),
                ("HSE_OFFICER","HSE Officer",35,False),
            ],
        },
    ],

    "Mining":[
        {
            "code":"MINE_OPS",
            "name":"Mining Operations",
            "positions":[
                ("MINE_MGR","Mine Manager",80,True),
                ("SHIFT_SUP","Shift Supervisor",45,False),
            ],
        },
        {
            "code":"ENG",
            "name":"Engineering & Maintenance",
            "positions":[
                ("ENG_MGR","Engineering Manager",70,True),
                ("MAINT_SUP","Maintenance Supervisor",45,False),
            ],
        },
        {
            "code":"HSE",
            "name":"Safety, Health & Environment",
            "positions":[
                ("HSE_MGR","SHE Manager",70,True),
                ("HSE_OFFICER","SHE Officer",40,False),
            ],
        },
        {
            "code":"SUPPLY",
            "name":"Supply Chain",
            "positions":[
                ("SUPPLY_MGR","Supply Chain Manager",70,True),
                ("BUYER","Buyer",40,False),
            ],
        },
    ],

    "Agriculture":[
        {
            "code":"FARM_OPS",
            "name":"Farm Operations",
            "positions":[
                ("FARM_MGR","Farm Manager",70,True),
                ("FIELD_SUP","Field Supervisor",40,False),
            ],
        },
        {
            "code":"PRODUCTION",
            "name":"Production",
            "positions":[
                ("PRODUCTION_MGR","Production Manager",65,True),
                ("PRODUCTION_OFFICER","Production Officer",35,False),
            ],
        },
        {
            "code":"BIO",
            "name":"Biological Assets",
            "positions":[
                ("BIO_MGR","Biological Assets Manager",60,True),
                ("BIO_OFFICER","Biological Assets Officer",35,False),
            ],
        },
        {
            "code":"STORES",
            "name":"Stores & Supplies",
            "positions":[
                ("STORES_MGR","Stores Manager",55,True),
                ("STOREKEEPER","Storekeeper",30,False),
            ],
        },
    ],

    "Private School":[
        {
            "code":"ACADEMIC",
            "name":"Academic",
            "positions":[
                ("PRINCIPAL","Principal",85,True),
                ("HOD","Head of Department",60,False),
            ],
        },
        {
            "code":"ADMIN",
            "name":"Administration",
            "positions":[
                ("ADMIN_MGR","Administration Manager",60,True),
                ("ADMIN_OFFICER","Administration Officer",30,False),
            ],
        },
        {
            "code":"FACILITIES",
            "name":"Facilities & Maintenance",
            "positions":[
                ("FACILITIES_MGR","Facilities Manager",55,True),
                ("MAINT_OFFICER","Maintenance Officer",30,False),
            ],
        },
    ],

    "NPO Education":[
        {
            "code":"PROGRAMMES",
            "name":"Programmes",
            "positions":[
                ("PROGRAMME_DIRECTOR","Programme Director",75,True),
                ("PROGRAMME_MGR","Programme Manager",60,False),
                ("PROGRAMME_OFFICER","Programme Officer",35,False),
            ],
        },
        {
            "code":"ME",
            "name":"Monitoring & Evaluation",
            "positions":[
                ("ME_MGR","M&E Manager",60,True),
                ("ME_OFFICER","M&E Officer",35,False),
            ],
        },
        {
            "code":"GRANTS",
            "name":"Grants & Compliance",
            "positions":[
                ("GRANTS_MGR","Grants Manager",65,True),
                ("GRANTS_OFFICER","Grants Officer",35,False),
            ],
        },
    ],

    "NPO Healthcare":[
        {
            "code":"PROGRAMMES",
            "name":"Programmes",
            "positions":[
                ("PROGRAMME_DIRECTOR","Programme Director",75,True),
                ("PROGRAMME_MGR","Programme Manager",60,False),
            ],
        },
        {
            "code":"CLINICAL",
            "name":"Clinical Services",
            "positions":[
                ("CLINICAL_MGR","Clinical Manager",70,True),
                ("CLINICAL_OFFICER","Clinical Officer",40,False),
            ],
        },
        {
            "code":"ME",
            "name":"Monitoring & Evaluation",
            "positions":[
                ("ME_MGR","M&E Manager",60,True),
                ("ME_OFFICER","M&E Officer",35,False),
            ],
        },
        {
            "code":"GRANTS",
            "name":"Grants & Compliance",
            "positions":[
                ("GRANTS_MGR","Grants Manager",65,True),
            ],
        },
    ],

    "Private Healthcare":[
        {
            "code":"CLINICAL",
            "name":"Clinical Services",
            "positions":[
                ("CLINICAL_DIRECTOR","Clinical Director",80,True),
                ("CLINICAL_MGR","Clinical Manager",65,False),
            ],
        },
        {
            "code":"PHARMACY",
            "name":"Pharmacy & Medical Supplies",
            "positions":[
                ("PHARMACY_MGR","Pharmacy Manager",65,True),
                ("STORES_OFFICER","Medical Stores Officer",35,False),
            ],
        },
        {
            "code":"ADMIN",
            "name":"Patient Administration",
            "positions":[
                ("ADMIN_MGR","Administration Manager",60,True),
            ],
        },
    ],

    "Restaurant":[
        {
            "code":"KITCHEN",
            "name":"Kitchen",
            "positions":[
                ("HEAD_CHEF","Head Chef",60,True),
                ("KITCHEN_SUP","Kitchen Supervisor",40,False),
            ],
        },
        {
            "code":"FOH",
            "name":"Front of House",
            "positions":[
                ("FOH_MGR","Front of House Manager",60,True),
                ("SUPERVISOR","Supervisor",35,False),
            ],
        },
        {
            "code":"STORES",
            "name":"Inventory & Stores",
            "positions":[
                ("STORES_MGR","Stores Manager",50,True),
                ("STOREKEEPER","Storekeeper",30,False),
            ],
        },
    ],
}

def get_ops_org_template(industry=None,sub_industry=None):
    from BackEnd.Services.utils.industry_utils import normalize_industry_pair

    industry_name,sub_name,_,_=normalize_industry_pair(industry,sub_industry)
    key=sub_name if sub_name in OPS_INDUSTRY_DEPARTMENTS else industry_name

    departments=[
        {
            **dept,
            "positions":[*dept.get("positions",[])],
        }
        for dept in OPS_BASE_DEPARTMENTS
    ]

    departments.extend([
        {
            **dept,
            "positions":[*dept.get("positions",[])],
        }
        for dept in OPS_INDUSTRY_DEPARTMENTS.get(
            key,
            OPS_INDUSTRY_DEPARTMENTS["General Business"],
        )
    ])

    return {
        "key":key or "General Business",
        "version":OPS_ORG_TEMPLATE_VERSION,
        "departments":departments,
    }