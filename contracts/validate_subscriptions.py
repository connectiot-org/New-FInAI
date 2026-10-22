"""Subscription schema examples; PostgreSQL tests cover relational rules."""
from pathlib import Path
import yaml
from jsonschema import Draft202012Validator, FormatChecker

doc = yaml.safe_load(Path(__file__).with_name('subscriptions.openapi.yaml').read_text())
def validator(name):
    return Draft202012Validator({**doc['components']['schemas'][name], 'components': doc['components']}, format_checker=FormatChecker())
count = 0
for path in doc['paths'].values():
    for op in path.values():
        if not isinstance(op, dict): continue
        for response in op.get('responses', {}).values():
            media = response.get('content', {}).get('application/json', {})
            if 'example' in media:
                name = media['schema']['$ref'].split('/')[-1]
                validator(name).validate(media['example']); count += 1
base = dict(id='33333333-3333-4333-8333-333333333333', entityId='22222222-2222-4222-8222-222222222222', supplierName='Example', subscriptionName='Plan', renewalDate='2028-02-29')
validator('CreateSubscription').validate(base)
for bad in [dict(base, renewalDate='2026-02-29'),dict(base, renewalDate='0000-01-01'),dict(base, organisationId=base['entityId']),dict(base,supplierName='')]:
    assert list(validator('CreateSubscription').iter_errors(bad))
print(f'PASS: {count} subscription examples and invalid input schemas')
