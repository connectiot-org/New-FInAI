"""Check transport examples; backend tests cover CSV grammar and matching."""
from pathlib import Path
import copy
import yaml
from jsonschema import Draft202012Validator, FormatChecker

doc = yaml.safe_load(Path(__file__).with_name('invoice-duplicates.openapi.yaml').read_text())
def validator(name):
    return Draft202012Validator({**doc['components']['schemas'][name], 'components': doc['components']}, format_checker=FormatChecker())
op = doc['paths']['/api/v1/invoice-duplicate-checks']['post']
request = op['requestBody']['content']['application/json']['example']
response = op['responses']['200']['content']['application/json']['example']
validator('CheckInput').validate(request)
validator('CheckResult').validate(response)
for bad in [dict(request, organisationId=request['entityId']), dict(request, csv=''), dict(request, entityId='invalid'), dict(request, csv='x'*131073)]:
    assert list(validator('CheckInput').iter_errors(bad))
for field, value in [('amount', 12.50), ('amount', '1e2'), ('invoiceDate', '2026-02-29'), ('groupSize', 0), ('currency', 'usd')]:
    bad = copy.deepcopy(response)
    bad['rows'][0][field] = value
    assert list(validator('CheckResult').iter_errors(bad))
print('PASS: invoice check request/result examples and nine invalid input/result schemas')
