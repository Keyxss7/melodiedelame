"""Test de bout en bout de l'admin avec une API GitHub simulée.
Lancer : python3 tests/admin.e2e.py  (le serveur `node build.js --serve` doit tourner sur :4173)
"""
import asyncio, base64, json, os, re, sys, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp/admin-shots'
os.makedirs(SHOTS, exist_ok=True)

# "Dépôt" en mémoire
repo = {}
for f in ['site.json', 'accueil.json', 'prestations.json', 'formations.json']:
    with open(os.path.join(ROOT, 'tests', 'fixtures', 'content', f), 'rb') as fh:  # jeu de données figé
        repo[f'content/{f}'] = fh.read()
commits = []
runs = []

def sha_of(b):
    import hashlib
    return hashlib.sha1(b).hexdigest()

async def handle(route, request):
    url = request.url
    m = re.match(r'https://api\.github\.com/repos/([^/]+/[^/]+)(/.*)?$', url)
    auth = request.headers.get('authorization', '')
    if auth != 'Bearer github_pat_TEST':
        return await route.fulfill(status=401, content_type='application/json', body=json.dumps({'message': 'Bad credentials'}))
    if not m:
        return await route.fulfill(status=404, body='{}')
    rest = m.group(2) or ''
    if rest == '':
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'full_name': m.group(1), 'default_branch': 'main', 'private': False, 'html_url': 'https://github.com/x'}),
                                   headers={'github-authentication-token-expiration': '2027-10-01 00:00:00 UTC'})
    if rest.startswith('/contents/'):
        path = rest[len('/contents/'):].split('?')[0]
        path = '/'.join(__import__('urllib.parse').parse.unquote(p) for p in path.split('/'))
        if request.method == 'GET':
            if path not in repo:
                return await route.fulfill(status=404, content_type='application/json', body='{"message":"Not Found"}')
            b = repo[path]
            return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'content': base64.b64encode(b).decode(), 'sha': sha_of(b), 'path': path}))
        if request.method == 'PUT':
            body = json.loads(request.post_data)
            if path in repo and body.get('sha') != sha_of(repo[path]):
                return await route.fulfill(status=409, content_type='application/json', body='{"message":"conflict"}')
            repo[path] = base64.b64decode(body['content'])
            commits.append({'path': path, 'message': body['message']})
            runs.insert(0, {'id': len(runs) + 1, 'status': 'completed', 'conclusion': 'success', 'html_url': 'https://github.com/x/actions/runs/1',
                            'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'updated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'head_sha': 'abc'})
            return await route.fulfill(status=201, content_type='application/json', body=json.dumps({'content': {'sha': sha_of(repo[path])}, 'commit': {'sha': 'abc'}}))
    if rest.startswith('/actions/runs'):
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'workflow_runs': runs[:1]}))
    if rest.startswith('/commits'):
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps([{'sha': 'abc', 'commit': {'committer': {'date': '2026-10-07T20:00:00Z'}, 'message': 'x'}}]))
    await route.fulfill(status=404, body='{}')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        page = await ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await page.route('https://api.github.com/**', handle)
        # Les images du site "en ligne" : on redirige melodiedelame.fr vers le serveur local
        async def proxy_site(r, req):
            resp = await ctx.request.get(req.url.replace('https://melodiedelame.fr', 'http://localhost:4173'))
            await r.fulfill(status=resp.status, body=await resp.body(), headers={'content-type': resp.headers.get('content-type', '')})
        await page.route('https://melodiedelame.fr/**', proxy_site)

        await page.goto('http://localhost:4173/admin/', wait_until='networkidle')
        await page.screenshot(path=f'{SHOTS}/01-login.png', full_page=True)

        # Mauvais jeton → message d'erreur
        await page.fill('input[name=repo]', 'jordan/melodiedelame')
        await page.fill('input[name=token]', 'mauvais')
        await page.click('button[type=submit]')
        await page.wait_for_selector('.banner-error')
        assert 'refusé' in (await page.inner_text('.banner-error')).lower()

        # Bon jeton
        await page.fill('input[name=repo]', 'jordan/melodiedelame')
        await page.fill('input[name=token]', 'github_pat_TEST')
        await page.click('button[type=submit]')
        await page.wait_for_selector('.tiles')
        await page.wait_for_function("document.querySelector('[data-count=prestations]').textContent.includes('prestation')")
        await page.screenshot(path=f'{SHOTS}/02-home.png', full_page=True)
        assert '6 prestations' in await page.inner_text('[data-count=prestations]')

        # Liste
        await page.click('a[href="#/prestations"]')
        await page.wait_for_selector('.rows .row')
        assert await page.locator('.rows .row').count() == 6
        await page.screenshot(path=f'{SHOTS}/03-liste.png', full_page=True)

        # Réordonner : descendre le premier
        await page.click('.rows .row:first-child [data-move=down]')
        await page.wait_for_selector('[data-order-save]:not([hidden])')
        await page.click('[data-order-save] button')
        await page.wait_for_function("document.querySelector('[data-order-save]').hidden === true")
        data = json.loads(repo['content/prestations.json'])
        assert data['items'][0]['id'] == 'ancrage-racines', data['items'][0]['id']
        assert data['items'][1]['id'] == 'caresse-vibratoire'

        # Ajouter une prestation avec photo
        await page.click('a[href="#/prestations/nouveau"]')
        await page.wait_for_selector('#edit')
        await page.fill('input[name=titre]', 'Bain de gong')
        await page.fill('textarea[name=sousTitre]', 'Une immersion collective.')
        await page.fill('textarea[name=description]', 'Premier paragraphe.\n\nSecond paragraphe.')
        await page.fill('input[name=duree]', '1 h 15')
        await page.fill('input[name=prix]', '35 €')
        await page.fill('[data-chips=benefices] input', 'Détente')
        await page.click('[data-chips=benefices] [data-add-chip]')
        await page.fill('[data-chips=benefices] input', 'Sommeil')
        await page.keyboard.press('Enter')
        await page.set_input_files('[data-photo-input]', os.path.join(ROOT, 'src', 'images', 'og-image.jpg'))
        await page.wait_for_function("document.querySelector('[data-photo-hint]').textContent.startsWith('Prête')")
        await page.screenshot(path=f'{SHOTS}/04-fiche.png', full_page=True)
        await page.click('#edit button[type=submit]')
        await page.wait_for_selector('.rows .row')
        await page.wait_for_function("document.querySelectorAll('.rows .row').length === 7")
        data = json.loads(repo['content/prestations.json'])
        new = data['items'][-1]
        assert new['id'] == 'bain-de-gong', new
        assert new['benefices'] == ['Détente', 'Sommeil'], new
        assert new['duree'] == '1 h 15' and new['prix'] == '35 €'
        assert new['image'].startswith('images/uploads/bain-de-gong-') and new['image'].endswith(('.webp', '.jpg')), new['image']
        uploaded = [k for k in repo if k.startswith('src/images/uploads/')]
        assert len(uploaded) == 1 and len(repo[uploaded[0]]) > 1000, uploaded
        await page.wait_for_selector('.statusbar.is-ok')
        await page.screenshot(path=f'{SHOTS}/05-liste-apres.png', full_page=True)

        # Modifier : masquer + supprimer la photo
        await page.click('a[href="#/prestations/bain-de-gong"]')
        await page.wait_for_selector('#edit')
        await page.click('[data-photo-remove]')
        await page.click('.toggle')
        await page.click('#edit button[type=submit]')
        await page.wait_for_function("document.querySelectorAll('.rows .row').length === 7")
        data = json.loads(repo['content/prestations.json'])
        new = data['items'][-1]
        assert new['visible'] is False and new['image'] == '', new
        assert 'Masquée' in await page.inner_text('.rows .row:last-child')

        # Initiation : blocs
        await page.goto('http://localhost:4173/admin/#/formations/nouveau')
        await page.wait_for_selector('#edit')
        await page.fill('input[name=titre]', 'Initiation Tambour')
        await page.fill('.bloc:first-child [data-bloc-points]', 'Point A\nPoint B\n\n')
        await page.click('[data-add-bloc]')
        assert await page.locator('.bloc').count() == 3
        await page.click('.bloc:last-child [data-remove-bloc]')
        await page.fill('input[name=prochainesDates]', '12 mars 2027')
        await page.click('#edit button[type=submit]')
        await page.wait_for_function("document.querySelectorAll('.rows .row').length === 5")
        data = json.loads(repo['content/formations.json'])
        f = data['items'][-1]
        assert f['id'] == 'initiation-tambour' and f['blocs'][0]['points'] == ['Point A', 'Point B'], f
        assert len(f['blocs']) == 1, f['blocs']  # le 2e bloc vide a été ignoré
        assert f['prochainesDates'] == '12 mars 2027'

        # Suppression
        await page.click('a[href="#/formations/initiation-tambour"]')
        await page.wait_for_selector('[data-delete]')
        await page.click('[data-delete]')
        await page.click('.modal [data-ok]')
        await page.wait_for_function("document.querySelectorAll('.rows .row').length === 4")

        # Page d'accueil : textes + sections (ajout, déplacement, suppression)
        await page.goto('http://localhost:4173/admin/#/accueil')
        await page.wait_for_selector('#edit')
        assert await page.locator('[data-section-key]').count() == 3
        await page.fill('textarea[name="hero.titre"]', 'Nouveau titre')
        await page.locator('[data-section-key="presentation"] summary').click()
        await page.fill('input[name="s:presentation.kicker"]', 'Kicker modifié')
        # Le premier ne peut pas monter, le dernier ne peut pas descendre
        assert await page.is_disabled('[data-section-key="presentation"] [data-section-move=up]')
        # Ajouter une section
        await page.click('[data-add-section]')
        new_key = await page.locator('[data-section-key][data-new="1"]').get_attribute('data-section-key')
        await page.fill(f'input[name="s:{new_key}.titre"]', 'Les bienfaits du son')
        await page.fill(f'textarea[name="s:{new_key}.paragraphes"]', 'Un.\n\nDeux.')
        await page.fill(f'[data-section-key="{new_key}"] [data-chips] input', 'Sommeil')
        await page.keyboard.press('Enter')
        assert (await page.inner_text(f'[data-section-key="{new_key}"] [data-section-label]')) == 'Les bienfaits du son'
        # La monter d'un cran (elle passe avant « sonotherapie »)
        await page.click(f'[data-section-key="{new_key}"] [data-section-move=up]')
        # Supprimer « parcours » (avec confirmation)
        await page.locator('[data-section-key="parcours"] summary').click()
        await page.click('[data-section-key="parcours"] [data-section-delete]')
        await page.click('.modal [data-ok]')
        assert await page.locator('[data-section-key]').count() == 3
        await page.screenshot(path=f'{SHOTS}/06-accueil.png', full_page=True)
        # Une section sans titre bloque l'enregistrement
        await page.fill(f'input[name="s:{new_key}.titre"]', '')
        await page.click('#edit button[type=submit]')
        await page.wait_for_selector('.toast-error')
        assert 'titre' in (await page.inner_text('.toast-error')).lower()
        await page.fill(f'input[name="s:{new_key}.titre"]', 'Les bienfaits du son')
        await page.click('#edit button[type=submit]')
        await page.wait_for_selector('.tiles')
        a = json.loads(repo['content/accueil.json'])
        assert a['hero']['titre'] == 'Nouveau titre'
        assert [s['id'] for s in a['sections']] == ['presentation', 'les-bienfaits-du-son', 'sonotherapie'], [s['id'] for s in a['sections']]
        assert a['sections'][0]['kicker'] == 'Kicker modifié'
        assert a['sections'][0]['image'] == 'images/logo2.webp' and a['sections'][0]['imageContain'] is True  # inchangées
        ns = a['sections'][1]
        assert ns['titre'] == 'Les bienfaits du son' and ns['paragraphes'] == ['Un.', 'Deux.'] and ns['puces'] == ['Sommeil'] and ns['image'] == '', ns
        assert a['sections'][2]['image'] == 'images/bol.webp'  # section existante conservée telle quelle

        # Brouillon de structure : ajout + suppression non enregistrés, puis repris
        await page.goto('http://localhost:4173/admin/#/accueil')
        await page.wait_for_selector('#edit')
        await page.click('[data-add-section]')
        k2 = await page.locator('[data-section-key][data-new="1"]').get_attribute('data-section-key')
        await page.fill(f'input[name="s:{k2}.titre"]', 'Brouillon de section')
        await page.locator('[data-section-key="sonotherapie"] summary').click()
        await page.click('[data-section-key="sonotherapie"] [data-section-delete]')
        await page.click('.modal [data-ok]')
        await page.wait_for_timeout(700)
        await page.goto('http://localhost:4173/admin/#/')
        await page.goto('http://localhost:4173/admin/#/accueil')
        await page.wait_for_selector('[data-draft-banner]')
        assert await page.locator('[data-section-key]').count() == 3  # structure enregistrée
        await page.click('[data-draft-apply]')
        keys = await page.eval_on_selector_all('[data-section-key]', 'els => els.map(e => e.dataset.sectionKey)')
        assert keys == ['presentation', 'les-bienfaits-du-son', k2], keys
        assert await page.input_value(f'input[name="s:{k2}.titre"]') == 'Brouillon de section'
        await page.goto('http://localhost:4173/admin/#/')
        await page.evaluate("localStorage.removeItem('mda.draft.accueil')")

        # Image de fond du haut de page, en simulant un iPhone (pas d'encodage WebP) :
        # la transparence doit être conservée (envoi en PNG, pas en JPEG à fond noir).
        await page.add_init_script("""(() => { const orig = HTMLCanvasElement.prototype.toBlob;
          HTMLCanvasElement.prototype.toBlob = function (cb, type, q) { return orig.call(this, cb, type === 'image/webp' ? 'image/png' : type, q); }; })()""")
        await page.goto('http://localhost:4173/admin/#/accueil')
        await page.reload()
        await page.wait_for_selector('[data-photo-hero] [data-photo-input]', state='attached')
        await page.set_input_files('[data-photo-hero] [data-photo-input]', os.path.join(ROOT, 'src', 'images', 'hero-chouette.webp'))
        await page.wait_for_function("document.querySelector('[data-photo-hero] [data-photo-hint]').textContent.startsWith('Prête')")
        await page.click('#edit button[type=submit]')
        await page.wait_for_selector('.tiles')
        a = json.loads(repo['content/accueil.json'])
        hero_img = a['hero'].get('image', '')
        assert hero_img.startswith('images/uploads/accueil-fond-') and hero_img.endswith('.png'), a['hero']
        assert repo['src/' + hero_img][:8] == b'\x89PNG\r\n\x1a\n', 'le fichier envoyé doit être un PNG'
        from PIL import Image as _Img
        import io as _io
        assert _Img.open(_io.BytesIO(repo['src/' + hero_img])).mode == 'RGBA', 'la transparence doit être conservée'
        # Retirer l'image de fond
        await page.goto('http://localhost:4173/admin/#/accueil')
        await page.wait_for_selector('[data-photo-hero] [data-photo-remove]:not([hidden])')
        await page.click('[data-photo-hero] [data-photo-remove]')
        await page.click('#edit button[type=submit]')
        await page.wait_for_selector('.tiles')
        assert json.loads(repo['content/accueil.json'])['hero']['image'] == ''

        # Réglages
        await page.goto('http://localhost:4173/admin/#/reglages')
        await page.wait_for_selector('#edit')
        await page.fill('input[name=telephone]', '06 00 00 00 00')
        await page.click('#edit button[type=submit]')
        await page.wait_for_selector('.tiles')
        assert json.loads(repo['content/site.json'])['telephone'] == '06 00 00 00 00'

        # Brouillon : taper puis quitter, revenir → bannière
        await page.goto('http://localhost:4173/admin/#/prestations/caresse-vibratoire')
        await page.wait_for_selector('#edit')
        await page.fill('input[name=titre]', 'Brouillon test')
        await page.wait_for_timeout(600)
        await page.goto('http://localhost:4173/admin/#/')
        await page.goto('http://localhost:4173/admin/#/prestations/caresse-vibratoire')
        await page.wait_for_selector('[data-draft-banner]')
        await page.click('[data-draft-apply]')
        assert await page.input_value('input[name=titre]') == 'Brouillon test'

        # Déconnexion
        await page.goto('http://localhost:4173/admin/#/')
        await page.click('[data-logout]')
        await page.click('.modal [data-ok]')
        await page.wait_for_selector('#login')

        # Le build fonctionne toujours avec le contenu modifié par l'admin
        import subprocess, tempfile
        tmp = tempfile.mkdtemp()
        os.makedirs(os.path.join(tmp, 'content'))
        for k, v in repo.items():
            if k.startswith('content/'):
                with open(os.path.join(tmp, k), 'wb') as fh: fh.write(v)
        r = subprocess.run(['node', '-e', f"import('{ROOT}/build.js').then(m => m.build({{out: '{tmp}/dist', contentDir: '{tmp}/content', quiet: true}}))"], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        html = open(os.path.join(tmp, 'dist', 'prestations.html'), encoding='utf8').read()
        assert 'Bain de gong' not in html  # masquée
        assert 'Nouveau titre' in open(os.path.join(tmp, 'dist', 'index.html'), encoding='utf8').read()

        print('commits:', len(commits))
        for c in commits: print('  -', c['message'])
        print('errors:', errors)
        assert not [e for e in errors if 'Failed to load resource' not in e], errors  # 401/404 attendus (mauvais jeton, image pas encore en ligne)
        await b.close()
        print('ADMIN E2E OK')

asyncio.run(main())
