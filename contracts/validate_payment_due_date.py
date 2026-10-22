"""Independent 1.0.0 calculator contract examples and negative schema checks."""
from pathlib import Path
import yaml
from jsonschema import Draft202012Validator, FormatChecker

doc = yaml.safe_load(Path(__file__).with_name('payment-due-date.openapi.yaml').read_text())
assert doc['info']['version'] == '1.0.0'
assert set(doc['paths']) == {'/api/v1/payment-due-date-checks'}
schemas = doc['components']['schemas']
def validator(name):
    Draft202012Validator.check_schema(schemas[name])
    return Draft202012Validator(schemas[name], format_checker=FormatChecker())
operation = doc['paths']['/api/v1/payment-due-date-checks']['post']
body = operation['requestBody']['content']['application/json']['example']
validator('PaymentDueDateInput').validate(body)
results = operation['responses']['200']['content']['application/json']['examples']
for item in results.values(): validator('PaymentDueDateResult').validate(item['value'])
for extra in [dict(invoiceDate='1900-02-29'),dict(invoiceDate='0000-01-01'),dict(invoiceDate='2026-04-31'),dict(termsDays='30'),dict(termsDays=0.5),dict(termsDays=-1),dict(termsDays=366),dict(entityId='bad'),dict(role='Admin')]:
    assert list(validator('PaymentDueDateInput').iter_errors({**body,**extra}))
for date in ['0001-01-01','2000-02-29','2028-02-29','9999-12-31']:
    validator('PaymentDueDateInput').validate({**body,'invoiceDate':date})
result = results['overdue']['value']
for extra in [dict(status='due_today'),dict(status='not_due'),dict(daysUntilDue=0),dict(dueDate='2026-02-29'),dict(extra=True)]:
    assert list(validator('PaymentDueDateResult').iter_errors({**result,**extra}))
print('PASS: payment contract request + 3 results; valid Gregorian dates, strict fields/terms and result sign schemas')
