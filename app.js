import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, query, where, orderBy } from "firebase/firestore";

// إعدادات الفايربيز المخصصة لمشروعك vnovels
const firebaseConfig = {
  apiKey: "AIzaSyD68gyOBwVdzjtNr5qi5NCuns9EdF_fRmY",
  authDomain: "vinny-web.firebaseapp.com",
  projectId: "vinny-web",
  storageBucket: "vinny-web.firebasestorage.app",
  messagingSenderId: "379297579267",
  appId: "1:379297579267:web:bdaca66ba72fd6455ba936",
  measurementId: "G-JCD0WF66T9"
};

// تهيئة الأدوات الأساسية
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// الـ API Key الخاص بك لرفع الصور مجاناً من الـ Gallery
const IMGBB_API_KEY = "bc44f9161e1388f362d3361274462f3d";

// الإيميل الرسمي الخاص بك لتشغيل حماية لوحة التحكم كـ Admin
const ADMIN_EMAIL = "anwarbah96@gmail.com";
let currentUser = null;
let activeMangaId = null;

// عناصر التحكم في الواجهات
const elements = {
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    userProfile: document.getElementById('user-profile'),
    userAvatar: document.getElementById('user-avatar'),
    adminPanelBtn: document.getElementById('admin-panel-btn'),
    homeSection: document.getElementById('home-section'),
    genresSection: document.getElementById('genres-section'),
    detailsSection: document.getElementById('details-section'),
    readerSection: document.getElementById('reader-section'),
    adminSection: document.getElementById('admin-section'),
    mangaGrid: document.getElementById('manga-grid'),
    adminMangaSelect: document.getElementById('admin-manga-select'),
    actualCommentForm: document.getElementById('actual-comment-form'),
    loginPrompt: document.querySelector('.login-prompt'),
    commentsList: document.getElementById('comments-list')
};

// --- نظام التحقق من الدخول وحماية الـ Admin ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        elements.loginBtn.classList.add('hidden');
        elements.userProfile.classList.remove('hidden');
        elements.userAvatar.src = user.photoURL;
        elements.actualCommentForm.classList.remove('hidden');
        if(elements.loginPrompt) elements.loginPrompt.classList.add('hidden');

        // تحقق صارم: هل أنت الحساب الإداري المعتمد؟
        if (user.email === ADMIN_EMAIL) {
            elements.adminPanelBtn.classList.remove('hidden');
        }
    } else {
        currentUser = null;
        elements.loginBtn.classList.remove('hidden');
        elements.userProfile.classList.add('hidden');
        elements.adminPanelBtn.classList.add('hidden');
        elements.actualCommentForm.classList.add('hidden');
        if(elements.loginPrompt) elements.loginPrompt.classList.remove('hidden');
    }
});

elements.loginBtn.addEventListener('click', () => signInWithPopup(auth, provider));
elements.logoutBtn.addEventListener('click', () => signOut(auth).then(() => showSection('home')));

// محرك تحويل الصفحات بسلاسة وثبات
function showSection(sectionName) {
    document.querySelectorAll('.page-section').forEach(sec => sec.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    
    if (sectionName === 'home') { elements.homeSection.classList.remove('hidden'); document.getElementById('home-btn').classList.add('active'); loadAllManga(); }
    else if (sectionName === 'genres') { elements.genresSection.classList.remove('hidden'); elements.homeSection.classList.remove('hidden'); document.getElementById('genres-btn').classList.add('active'); }
    else if (sectionName === 'admin') { elements.adminSection.classList.remove('hidden'); elements.adminPanelBtn.classList.add('active'); loadAdminSelect(); }
    else if (sectionName === 'details') { elements.detailsSection.classList.remove('hidden'); }
    else if (sectionName === 'reader') { elements.readerSection.classList.remove('hidden'); }
}

document.getElementById('home-btn').addEventListener('click', () => showSection('home'));
document.getElementById('genres-btn').addEventListener('click', () => showSection('genres'));
elements.adminPanelBtn.addEventListener('click', () => showSection('admin'));
document.querySelectorAll('.back-btn').forEach(btn => btn.addEventListener('click', () => showSection('home')));

// --- لوحة التحكم: رفع غلاف المانجا مجاناً من المعرض ---
document.getElementById('save-manga-btn').addEventListener('click', async () => {
    const title = document.getElementById('admin-manga-title').value;
    const genres = document.getElementById('admin-manga-genres').value.split(',').map(g => g.trim());
    const desc = document.getElementById('admin-manga-desc').value;
    const coverFile = document.getElementById('admin-manga-cover').files[0];

    if (!title || !coverFile) return alert("يرجى ملء الاسم واختيار صورة الغلاف");

    try {
        let formData = new FormData();
        formData.append("image", coverFile);

        // الرفع المباشر والمجاني إلى خادم الصور البديل
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: "POST",
            body: formData
        });
        const resData = await response.json();
        const downloadURL = resData.data.url;

        // حفظ تفاصيل العمل بـ Firestore
        await addDoc(collection(db, "manga"), {
            title: title,
            genres: genres,
            description: desc,
            cover: downloadURL,
            createdAt: Date.now()
        });

        alert("تم إنشاء وإضافة عمل المانجا بنجاح!");
        showSection('home');
    } catch (err) { alert("حدث خطأ أثناء الرفع: " + err.message); }
});

// --- لوحة التحكم: رفع صفحات الفصول المتعددة مجاناً ---
document.getElementById('save-chapter-btn').addEventListener('click', async () => {
    const mangaId = elements.adminMangaSelect.value;
    const chNumber = document.getElementById('admin-chapter-number').value;
    const pageFiles = document.getElementById('admin-chapter-pages').files;
    const progressDiv = document.getElementById('upload-progress');

    if (!mangaId || !chNumber || pageFiles.length === 0) return alert("أكمل البيانات واختر صور الفصل");

    progressDiv.innerText = "جاري رفع الصفحات مجاناً، يرجى الانتظار...";
    const pageUrls = [];

    try {
        for (let i = 0; i < pageFiles.length; i++) {
            const file = pageFiles[i];
            let formData = new FormData();
            formData.append("image", file);

            const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                method: "POST",
                body: formData
            });
            const resData = await response.json();
            pageUrls.push(resData.data.url);
            
            progressDiv.innerText = `تم رفع ${i+1} من أصل ${pageFiles.length} صفحة...`;
        }

        await addDoc(collection(db, "chapters"), {
            mangaId: mangaId,
            chapterNumber: parseInt(chNumber),
            pages: pageUrls,
            createdAt: Date.now()
        });

        alert(`تم نشر الفصل رقم ${chNumber} بنجاح!`);
        progressDiv.innerText = "";
        showSection('home');
    } catch (err) { alert("فشل رفع الفصل: " + err.message); progressDiv.innerText = ""; }
});

// --- عرض البيانات وقراءتها بالصفحة الرئيسية والبحث ---
async function loadAllManga(filterGenre = null, searchQuery = null) {
    elements.mangaGrid.innerHTML = '<div class="loading-spinner">جاري تحميل عوالم المانجا...</div>';
    let q = query(collection(db, "manga"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    elements.mangaGrid.innerHTML = '';

    querySnapshot.forEach((docSnap) => {
        const manga = docSnap.data();
        const id = docSnap.id;

        if (filterGenre && !manga.genres.includes(filterGenre)) return;
        if (searchQuery && !manga.title.toLowerCase().includes(searchQuery.toLowerCase())) return;

        const card = document.createElement('div');
        card.className = 'manga-card';
        card.innerHTML = `
            <img src="${manga.cover}" alt="${manga.title}">
            <div class="manga-card-info">
                <h3>${manga.title}</h3>
            </div>
        `;
        card.addEventListener('click', () => openMangaDetails(id, manga));
        elements.mangaGrid.appendChild(card);
    });
}

// محرك البحث والفرز بالتصنيفات
document.getElementById('search-btn').addEventListener('click', () => {
    loadAllManga(null, document.getElementById('search-input').value);
});
document.querySelectorAll('.genre-tag').forEach(tag => {
    tag.addEventListener('click', (e) => {
        document.querySelectorAll('.genre-tag').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        loadAllManga(e.target.dataset.genre, null);
    });
});

// فتح صفحة التفاصيل وعرض فصولها
async function openMangaDetails(id, manga) {
    activeMangaId = id;
    showSection('details');
    document.getElementById('detail-cover').src = manga.cover;
    document.getElementById('detail-title').innerText = manga.title;
    document.getElementById('detail-description').innerText = manga.description;
    
    const genresDiv = document.getElementById('detail-genres');
    genresDiv.innerHTML = '';
    manga.genres.forEach(g => { genresDiv.innerHTML += `<span class="genre-tag">${g}</span>`; });

    const chList = document.getElementById('chapters-list');
    chList.innerHTML = 'جاري إحضار الفصول...';

    const q = query(collection(db, "chapters"), where("mangaId", "==", id), orderBy("chapterNumber", "desc"));
    const snap = await getDocs(q);
    chList.innerHTML = '';

    snap.forEach(docSnap => {
        const ch = docSnap.data();
        const row = document.createElement('div');
        row.className = 'genre-tag';
        row.style.display = 'block';
        row.style.margin = '10px 0';
        row.innerText = `الفصل رقم: ${ch.chapterNumber}`;
        row.addEventListener('click', () => openChapterReader(ch, docSnap.id));
        chList.appendChild(row);
    });
}

// فتح قارئ الفصول الاحترافي للمانهوا والتعليقات
function openChapterReader(chapter, chapterDocId) {
    showSection('reader');
    document.getElementById('reader-chapter-title').innerText = `الفصل رقم ${chapter.chapterNumber}`;
    const viewer = document.getElementById('viewer-images');
    viewer.innerHTML = '';

    chapter.pages.forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.loading = 'lazy';
        viewer.appendChild(img);
    });

    document.querySelector('.back-to-manga-btn').onclick = () => {
        elements.readerSection.classList.add('hidden');
        elements.detailsSection.classList.remove('hidden');
    };

    loadComments(chapterDocId);

    // تفعيل كود كتابة تعليق جديد للزوار المسجلين
    document.getElementById('submit-comment-btn').onclick = async () => {
        const text = document.getElementById('comment-text').value;
        if (!text) return;

        await addDoc(collection(db, "comments"), {
            chapterId: chapterDocId,
            userName: currentUser.displayName,
            userAvatar: currentUser.photoURL,
            commentText: text,
            createdAt: Date.now()
        });

        document.getElementById('comment-text').value = '';
        loadComments(chapterDocId);
    };
}

// سحب وعرض التعليقات الحية للفصل
async function loadComments(chapterDocId) {
    elements.commentsList.innerHTML = 'جاري تحديث النقاشات...';
    const q = query(collection(db, "comments"), where("chapterId", "==", chapterDocId), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    elements.commentsList.innerHTML = '';

    snap.forEach(docSnap => {
        const c = docSnap.data();
        const card = document.createElement('div');
        card.className = 'comment-card';
        card.innerHTML = `
            <img src="${c.userAvatar}" alt="avatar">
            <div class="comment-info">
                <h4>${c.userName}</h4>
                <p>${c.commentText}</p>
            </div>
        `;
        elements.commentsList.appendChild(card);
    });
}

// تحديث خيارات الاختيار في لوحة التحكم بشكل دوري للأدمن
async function loadAdminSelect() {
    elements.adminMangaSelect.innerHTML = '';
    const snap = await getDocs(collection(db, "manga"));
    snap.forEach(docSnap => {
        elements.adminMangaSelect.innerHTML += `<option value="${docSnap.id}">${docSnap.data().title}</option>`;
    });
}

// الإقلاع الأولي للموقع
loadAllManga();
