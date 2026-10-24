"""Receivables 1.0.0 transport checks; DB/TS tests enforce relational invariants."""
from pathlib import Path
import copy
import json
import yaml
from jsonschema import Draft202012Validator, FormatChecker
root = Path(__file__).parent
doc = yaml.safe_load((root / 'receivables.openapi.yaml').read_text())
def validator(name):
    return Draft202012Validator({**doc['components']['schemas'][name], 'components': doc['components']}, format_checker=FormatChecker())
count = 0
for response in doc['paths']['/api/v1/receivables/outstanding-customers']['get']['responses'].values():
    media = response['content']['application/json']
    for example in ([media['example']] if 'example' in media else [v['value'] for v in media['examples'].values()]):
        validator(media['schema']['$ref'].split('/')[-1]).validate(example)
        count += 1
sample = json.loads((root / 'receivables-examples/import-v1.json').read_text())
validator('ImportRegister').validate(sample)
for patch in [{'currency':'EUR'}, {'completeRegister':False}, {'extra':True}, {'invoices':[dict(sample['invoices'][0], issuedOn='2026-02-29')]}, {'invoices':[dict(sample['invoices'][0], amountCents=9007199254740992)]}]:
    assert list(validator('ImportRegister').iter_errors(dict(sample, **patch)))
ready = doc['paths']['/api/v1/receivables/outstanding-customers']['get']['responses']['200']['content']['application/json']['examples']['ready']['value']
for patch in [{'totalCents':-1}, {'rows':ready['rows']*6}, {'period':'0000-01'}, {'period':'2026-13'}, {'entityId':'us'}, {'extra':1}]:
    assert list(validator('Ready').iter_errors(dict(ready, **patch)))
for bad in [dict(entityId='us',period='all'),dict(entityId=ready['entityId'],period=['all','all']),dict(entityId=ready['entityId'],period='2026-09',tenant='x')]:
    assert list(validator('Scope').iter_errors(bad))
print(f'PASS: {count} receivables examples, import and invalid scope/date/money/row schemas')
