"""Pinned detail/CSV transport examples; relational arithmetic/permission checks run against PostgreSQL."""
from pathlib import Path
import copy
import yaml
from jsonschema import Draft202012Validator,FormatChecker
p=Path(__file__).with_name('receivables-detail.openapi.yaml');doc=yaml.safe_load(p.read_text())
def validator(name):return Draft202012Validator({**doc['components']['schemas'][name],'components':doc['components']},format_checker=FormatChecker())
for route in doc['paths'].values():
 media=route['get']['responses']['200']['content']['application/json'];validator(media['schema']['$ref'].split('/')[-1]).validate(media['example'])
row=doc['paths']['/api/v1/receivables/invoices']['get']['responses']['200']['content']['application/json']['example']
for patch in [dict(entityId='us'),dict(offset=-1),dict(remainingCents=9007199254740992),dict(extra=True)]:assert list(validator('Invoices').iter_errors(dict(row,**patch)))
bad=copy.deepcopy(row);bad['items'][0]['issuedOn']='2026-02-29';assert list(validator('Invoices').iter_errors(bad))
change=doc['paths']['/api/v1/receivables/changes']['get']['responses']['200']['content']['application/json']['example']
for money in ['-0','01','+1','1.5',1]:
 bad=copy.deepcopy(change);bad['deltaCents']=money;assert list(validator('Changes').iter_errors(bad))
bad=copy.deepcopy(change);bad['items'][0]['earlier']['amountCents']=100000;assert list(validator('Changes').iter_errors(bad))
bad=copy.deepcopy(change);bad['offset']=20001;assert list(validator('Changes').iter_errors(bad))
large=copy.deepcopy(change);large['earlierOutstandingCents']='90071992547409910000';validator('Changes').validate(large)
print('PASS: 6 pinned detail/history/export/change examples and invalid scope/date/money schemas')
