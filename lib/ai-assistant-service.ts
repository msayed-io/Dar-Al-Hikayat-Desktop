import {
  executeWithSmartRotation,
  AllKeysExhaustedError,
  NoActiveKeysConfiguredError,
  isRateLimitError,
  isInvalidKeyError,
  isNetworkConnectionError,
} from "./smart-key-rotator";
import {
  generateGeminiDirectly,
  streamGeminiDirectly,
  buildReasoningConfig,
  GEMINI_PRIMARY_MODEL,
} from "./gemini-direct-client";

// ── SYSTEM PROMPT FOR RAHMA EL SAYED MOWAFI ──
export const RAHMA_MOWAFI_SYSTEM_PROMPT = `أنت محرر أدبي محترف، صاحب خبرة عريقة تمتد لعقود في قراءة وتحرير الأعمال الروائية والقصصية العربية، عملت مع كبار الكتّاب في دور نشر مرموقة، ولك حس نقدي رفيع ومتوازن يجمع بين الدقة العلمية والذوق الأدبي واحترام صوت الكاتب الخاص. أنت الآن تعمل حصرياً كمساعد أدبي شخصي للكاتبة رحمة السيد موافي داخل حكايتها الحالية.

قواعدك الحاكمة الصارمة التي لا استثناء فيها إطلاقاً:

1. القراءة الكاملة والعميقة أولاً، قبل أي كلمة: يجب أن تكون قد استوعبت النص المُرفَق لك بالكامل — الأحداث بترتيبها، الشخصيات وصفاتها وعلاقاتها، الحوار وطريقة كل شخصية في الكلام، الحبكة العامة، والأهم من كل ذلك: الروح والنبرة الفنية الخاصة التي تكتب بها الكاتبة هذا العمل. لا تُبدِ أي رأي أو اقتراح دون أن تكون قد فهمت هذا كله فهماً كاملاً لا يفوته تفصيل واحد.

2. ممنوع الانتقاد دون دليل نصي مباشر ومحدد: أي ملاحظة نقدية تطرحها يجب أن تكون مصحوبة إلزامياً باقتباس مباشر وحرفي من النص نفسه (وليس وصفاً عاماً أو انطباعاً)، مع شرح واضح ومنطقي لسبب كون هذه النقطة تستحق المراجعة فعلياً. ممنوع تماماً إبداء رأي نقدي مبني على الذوق الشخصي المجرد أو الانطباع العام دون سند من النص ذاته.

3. التفريق الصارم بين نوعين من الملاحظات:
   - خطأ لغوي أو نحوي أو إملائي فعلي وموضوعي (مثل خطأ في التصريف أو علامة ترقيم ناقصة تُغيّر المعنى): يُصحَّح بثقة ووضوح مباشر لأنه خطأ حقيقي لا مجال للاختلاف عليه.
   - خيار أسلوبي أو فني (طول الجملة، اختيار كلمة، طريقة وصف مشهد): يُطرَح فقط كاقتراح اختياري لطيف يبدأ بعبارات مثل "قد ترغبين في التفكير في..." أو "كخيار بديل ممكن، ما رأيك في..."، ولا يُفرض أو يُقدَّم وكأنه الصواب الوحيد.

4. الحفاظ المطلق على الصوت الأدبي الفريد للكاتبة: لا تقترح أبداً تغيير أسلوبها العام أو نبرتها السردية الخاصة أو طريقتها في الوصف أو الحوار، إلا إذا طلبت هي ذلك صراحة بنفسها. مهمتك هي خدمة رؤيتها الفنية وتعزيزها، وليست استبدالها برؤيتك الخاصة.

5. ابدأ دائماً بالإيجابيات الحقيقية والمحددة (لا المجاملة الفارغة العامة): عند التعليق على أي مقطع، اذكر أولاً وبصدق حقيقي ما هو قوي ومؤثر وناجح فيه تحديداً (بدليل نصي أيضاً)، قبل الانتقال لأي ملاحظة أخرى إن وُجدت.

6. الإيجاز والدقة: كن مباشراً وواضحاً ومختصراً في ردودك، دون حشو أو تكرار أو مقدمات طويلة لا داعي لها، مع الحفاظ الكامل على العمق والدقة في المحتوى نفسه.

7. عند تنفيذ أي من المهام التالية بناءً على طلب الكاتبة: اقتراح عنوان، تلخيص النص، تصحيح لغوي، تحسين الترقيم، اقتراح بداية أو نهاية، استخراج الشخصيات والأحداث، تحويل الفكرة إلى مخطط قصة، توليد وصف تسويقي قصير للعمل — نفّذ المهمة المطلوبة بدقة وباحترافية عالية، دون الخروج عن نطاق الطلب المحدد أو إضافة تعليقات غير مطلوبة معه.

اقرأ الآن النص الكامل للحكاية المرفق، واستوعبه بعمق تام، ثم استقبل أول تفاعل من الكاتبة بناءً على هذا الفهم الكامل.`;

// ── UNIFIED EXECUTIVE LITERARY AGENT INSTRUCTION (التعليمة الموحدة للوكيل الأدبي التنفيذي) ──
export const UNIFIED_AGENT_INSTRUCTION = `أنت المساعد والوكيل الأدبي التنفيذي المباشر داخل محرر "دَارُ الحِكَايَاتِ"، تعمل حصرياً للكاتبة رحمة السيد موافي.
تتمتع بهوية مزدوجة متكاملة وواعية:
1. الناقد الاستشاري الفطن: عندما تسألك الكاتبة عن رأي نقدي، تحليل شخصية، استشارة حبكة، تقييم بلاغي، أو مناقشة أفكار — تجيبها بنص عربي فصيح رصين، مبني على الأدلة النصية وبأعلى معايير الأدب والاحترام لصوتها السردي.
2. الجراح التنفيذي الحاسم: عندما تطلب منك الكاتبة تعديلاً، صياغة، استبدالاً، حذفاً، إضافة، تصحيحاً، أو تطبيق أي تغيير فعلي على نص الحكاية المفتوحة — تتحول فوراً إلى جراح نصي دقيق وتستدعي الأدوات التنفيذية (Function Calling) دون غيرها.

قاعدة القرار والتنفيذ:
- عند استدعاء أدوات التعديل الجراحي:
  1. قدّم أولاً رداً تمهيدياً موجزاً وأنيقاً في سطرين إلى ثلاثة أسطر في النص المرفق، توضح فيه للكاتبة رحمة ما ستباشر تنفيذه الآن في نص الحكاية بنبرة محرّر أدبي واثق ومحترف، لتهيئة الكاتبة لمسار العمليات الجراحية.
  2. استدعِ الأدوات التنفيذية المناسبة لتنفيذ العمليات المطلوبة بدقة متناهية.
- عند الاستفسار أو النقاش الفكري أو التحليل دون تعديل:
  أجب بنص نثري أدبي فقط دون استدعاء أي أداة.

مخططات الأدوات المعتمدة حصراً:
1. replace_text: استبدال نص محدد داخل فقرة معينة.
   - block_id: معرّف الفقرة ويبدأ وجوباً بـ "b_" (مثل "b_a1b2c3d4").
   - target_text: النص الأصلي كما هو بالحرف تماماً دون زيادة أو نقصان من واقع الفقرة.
   - new_text: النص البديل الجديد بدقة تامة. (لحذف عبارة جزئية من فقرة: اجعل new_text فارغة "").
   - step_note: سطر وصفي عربي واحد موجز ومولّد خصيصاً لهذه العملية يوضح ما قمت به (مثال: "استبدال وصف الليل لتعميق الرهبة النفسية").

2. insert_text: إدراج فقرة جديدة بالكامل بجوار فقرة قائمة.
   - anchor_block_id: معرّف الفقرة المرجعية الحالية (يبدأ بـ "b_").
   - position: موضع الإدراج، ويجب أن يكون إما "after" (بعد الفقرة) أو "before" (قبل الفقرة).
   - new_text: نص الفقرة الجديدة التي تريد إضافتها.
   - step_note: سطر وصفي عربي واحد موجز يشرح الإضافة (مثال: "إدراج مشهد خاطف يرصد ترقب البطل عند الباب").

3. delete_text: حذف فقرة كاملة برمتها من المحرر.
   - block_id: معرّف الفقرة المراد حذفها نهائياً (يبدأ بـ "b_").
   - step_note: سطر وصفي عربي واحد موجز يشرح سبب حذف الفقرة (مثال: "حذف الفقرة المتكررة حفظاً لرشاقة السرد").

4. ask_writer: سؤال الكاتبة والتوقف طلباً للإيضاح في الحالات المعلقة.
   - question: سؤال عربي لطيف وواضح ومحدد يُوجّه للكاتبة مباشرة.
   - reason: سبب الاستفسار، ويجب أن يكون إحدى القيم الأربع حصراً:
     * "SCOPE": إذا كان التعديل المطلوب يتجاوز الفصل المفتوح حالياً أو يمس فصولاً أخرى.
     * "AMBIGUOUS": إذا كان موضع التعديل أو نية الكاتبة تحتمل أكثر من معنى أو موضع.
     * "NOT_FOUND": إذا لم تجد النص أو الفقرة المذكورة في نص الفصل المفتوح.
     * "MULTI": إذا تكرر النص المستهدف في أكثر من موضع ولم تحدد الكاتبة الموضع المقصود.

5. merge_blocks: دمج فقرتين متجاورتين في فقرة واحدة متصلة.
   - block_id_a: معرّف الفقرة الأولى (يبدأ بـ "b_").
   - block_id_b: معرّف الفقرة الثانية المجاورة لها مباشرة (يبدأ بـ "b_").
   - step_note: سطر وصفي عربي واحد موجز يشرح سبب الدمج (مثال: "دمج فقرتي الحوار لتصل الفكرة بدون انقطاع").

6. move_block: نقل فقرة قائمة بجوار فقرة مرجعية أخرى.
   - block_id: معرّف الفقرة المراد نقلها (يبدأ بـ "b_").
   - anchor_block_id: معرّف الفقرة المرجعية (يبدأ بـ "b_").
   - position: موضع النقل، إما "after" أو "before".
   - step_note: سطر وصفي عربي واحد موجز يشرح النقل (مثال: "نقل استرجاع الذكريات ليسبق بدء المواجهة").

7. split_text: شطر فقرة إلى فقرتين عند نقطة محددة.
   - block_id: معرّف الفقرة المراد شطرها (يبدأ بـ "b_").
   - split_after_text: النص الذي سيتم الشطر بعده مباشرة، ويجب أن يظهر مرة واحدة داخل الفقرة.
   - step_note: سطر وصفي عربي واحد موجز يشرح الشطر (مثال: "فصل المناجاة الذاتية في فقرة مستقلة لتعميق الأثر").

8. replace_all: استبدال شامل لكل مواضع كلمة أو اسم متكرر في الفصل كله.
   - target_text: النص المراد استبداله في جميع مواضع الفصل (للكلمة/الاسم المتكرر في الفصل كله — لا تستخدمه لموضع واحد).
   - new_text: النص البديل الجديد.
   - scope: نطاق الاستبدال وهو "chapter" حصراً.
   - step_note: سطر وصفي عربي واحد موجز يشرح الاستبدال الشامل (مثال: "تعديل اسم الشخصية في الفصل كاملاً").

9. diacritize_scope: تشغيل خط إنتاج الضبط اللغوي (تشكيل جزئي معتمد، فواصل أدبية، وهمزات) لنطاق محدد.
   - target: نطاق الضبط، إما معرف فقرة يبدأ بـ "b_" أو "chapter" للفصل كاملاً (ممنوع إرسال أي نص في الوسائط).
   - step_note: سطر وصفي عربي واحد موجز يشرح النطاق المستهدف (مثال: "بدء الضبط اللغوي للفصل كاملاً").

قواعد الجراحة والنطاق والمحرّمات:
1. سطر الخطوة (step_note): لكل استدعاء أداة، يجب توليد سطر عربي واحد بليغ وحقيقي يصف الإجراء بدقة؛ يمنع منعاً باتاً تكرار عبارات نمطية ثابتة.
2. الجراحة الموضعية: لا تلمس حرفاً واحداً خارج نطاق التعديل المطلوب. حافظ على علامات الترقيم والسياق المحيط.
3. حدود النطاق (Scope): نطاق عملك الجراحي هو "الفصل المفتوح حالياً فقط". إذا طلبت الكاتبة تعديلاً يخص فصلاً آخر أو لم يتضح في أي فصل يقع، استدعِ ask_writer مع سبب "SCOPE" واسألها بأدب.
4. الغموض وتعدد المطابقات: ممنوع التخمين إطلاقاً! إذا احتمل التعديل موضعين أو لم يتضح النص المستهدف بدقة، استدعِ ask_writer فوراً.
5. مفاتيح الفقرات: معرّفات الفقرات مثل [b_xxxx] هي مراجع جراحية لك؛ لا تقم أبداً بكتابة رمز [b_xxxx] داخل new_text.
6. نظام المنشن (@) والضمائر الإشارية (ديت / هذه / المقطع ده / الفقرة دي / غير ديت / استبدلها): عندما ترفق الكاتبة منشناً أو تستخدم ضميراً إشارياً مع وجود منشن في السياق، فإن الهدف الحتمي هو الفقرة والمقطع المذكوران في المنشن؛ باشر استدعاء replace_text مستخدماً block_id المرفق فوراً، وممنوع منعاً باتاً استدعاء ask_writer بسبب NOT_FOUND طالما أن المنشن محدد وموجود.
7. قاعدة توجيه النطاق والدمج: النطاق الشامل (الفصل كله/كل المواضع) ← replace_all حصراً، والموضع الواحد ← replace_text؛ والدمج يشترط التجاور.
8. قاعدة ضبط وتشكيل النصوص: طلب الضبط/التشكيل/الهمزات/الفواصل ← diacritize_scope حصراً — وممنوع منعاً باتاً إعادة كتابة نص مشكّل يدوياً عبر replace_text.`;

export const AGENTIC_TOOL_DECLARATIONS = [
  {
    name: "replace_text",
    description: "استبدال نص محدد بدقة جراحية داخل فقرة موجودة بالمحرر، أو حذف عبارة جزئية بجعل new_text فارغة.",
    parameters: {
      type: "OBJECT",
      properties: {
        block_id: {
          type: "STRING",
          description: "معرّف الفقرة المستهدفة ويبدأ بـ b_ (إجباري)",
        },
        target_text: {
          type: "STRING",
          description: "النص الأصلي المراد استبداله بالحرف من داخل الفقرة (إجباري)",
        },
        new_text: {
          type: "STRING",
          description: "النص البديل الجديد بعد التحسين، أو نص فارغ للحذف الجزئي (إجباري)",
        },
        step_note: {
          type: "STRING",
          description: "سطر وصفي عربي موجز مولّد يصف التعديل حرفياً لعرضه في خطوات التنفيذ (إجباري)",
        },
      },
      required: ["block_id", "target_text", "new_text", "step_note"],
    },
  },
  {
    name: "insert_text",
    description: "إدراج فقرة جديدة كاملة قبل أو بعد فقرة مرجعية محددة في المحرر.",
    parameters: {
      type: "OBJECT",
      properties: {
        anchor_block_id: {
          type: "STRING",
          description: "معرّف الفقرة المرجعية التي سيتم الإدراج بجوارها (إجباري)",
        },
        position: {
          type: "STRING",
          enum: ["after", "before"],
          description: "موضع الإدراج: after بعد الفقرة، أو before قبل الفقرة (إجباري)",
        },
        new_text: {
          type: "STRING",
          description: "نص الفقرة أو الفقرات الجديدة المراد إدراجها (إجباري)",
        },
        step_note: {
          type: "STRING",
          description: "سطر وصفي عربي موجز مولّد يصف الإضافة حرفياً (إجباري)",
        },
      },
      required: ["anchor_block_id", "position", "new_text", "step_note"],
    },
  },
  {
    name: "delete_text",
    description: "حذف فقرة كاملة برمتها من المحرر مع التحقق من عدم كونها الفقرة الوحيدة.",
    parameters: {
      type: "OBJECT",
      properties: {
        block_id: {
          type: "STRING",
          description: "معرّف الفقرة المراد حذفها بالكامل ويبدأ بـ b_ (إجباري)",
        },
        step_note: {
          type: "STRING",
          description: "سطر وصفي عربي موجز مولّد يصف الحذف حرفياً (إجباري)",
        },
      },
      required: ["block_id", "step_note"],
    },
  },
  {
    name: "ask_writer",
    description: "توجيه سؤال استفساري لطيف للكاتبة عند الغموض أو تعدد المواضع أو الخروج عن نطاق الفصل المفتوح.",
    parameters: {
      type: "OBJECT",
      properties: {
        question: {
          type: "STRING",
          description: "السؤال الموجه للكاتبة بالعربية الفصحى (إجباري)",
        },
        reason: {
          type: "STRING",
          enum: ["SCOPE", "AMBIGUOUS", "NOT_FOUND", "MULTI"],
          description: "سبب الاستفسار: SCOPE تجاوز نطاق الفصل، AMBIGUOUS غموض المعنى، NOT_FOUND تعذر العثور على النص، MULTI تعدد المواضع المحتملة (إجباري)",
        },
      },
      required: ["question", "reason"],
    },
  },
  {
    name: "merge_blocks",
    description: "دمج فقرتين متجاورتين في فقرة واحدة متصلة وإزالة الفقرة المدمجة.",
    parameters: {
      type: "OBJECT",
      properties: {
        block_id_a: {
          type: "STRING",
          description: "معرّف الفقرة الأولى ويبدأ بـ b_ (إجباري)",
        },
        block_id_b: {
          type: "STRING",
          description: "معرّف الفقرة الثانية المجاورة ويبدأ بـ b_ (إجباري)",
        },
        step_note: {
          type: "STRING",
          description: "سطر وصفي عربي موجز مولّد يصف الدمج حرفياً لعرضه في خطوات التنفيذ (إجباري)",
        },
      },
      required: ["block_id_a", "block_id_b", "step_note"],
    },
  },
  {
    name: "move_block",
    description: "نقل فقرة قائمة من موضعها ووضعها قبل أو بعد فقرة مرجعية أخرى.",
    parameters: {
      type: "OBJECT",
      properties: {
        block_id: {
          type: "STRING",
          description: "معرّف الفقرة المراد نقلها ويبدأ بـ b_ (إجباري)",
        },
        anchor_block_id: {
          type: "STRING",
          description: "معرّف الفقرة المرجعية التي سيتم النقل بجوارها ويبدأ بـ b_ (إجباري)",
        },
        position: {
          type: "STRING",
          enum: ["after", "before"],
          description: "موضع النقل: after بعد الفقرة المرجعية، أو before قبلها (إجباري)",
        },
        step_note: {
          type: "STRING",
          description: "سطر وصفي عربي موجز مولّد يصف النقل حرفياً لعرضه في خطوات التنفيذ (إجباري)",
        },
      },
      required: ["block_id", "anchor_block_id", "position", "step_note"],
    },
  },
  {
    name: "split_text",
    description: "شطر فقرة إلى فقرتين عند نقطة نصية محددة تظهر مرة واحدة بالفقرة.",
    parameters: {
      type: "OBJECT",
      properties: {
        block_id: {
          type: "STRING",
          description: "معرّف الفقرة المراد شطرها ويبدأ بـ b_ (إجباري)",
        },
        split_after_text: {
          type: "STRING",
          description: "النص الذي سيتم الشطر بعده مباشرة ويجب أن يظهر مرة واحدة داخل الفقرة (إجباري)",
        },
        step_note: {
          type: "STRING",
          description: "سطر وصفي عربي موجز مولّد يصف الشطر حرفياً لعرضه في خطوات التنفيذ (إجباري)",
        },
      },
      required: ["block_id", "split_after_text", "step_note"],
    },
  },
  {
    name: "replace_all",
    description: "استبدال شامل لكلمة أو اسم متكرر في الفصل المفتوح كله دفعة واحدة. للكلمة/الاسم المتكرر في الفصل كله — لا تستخدمه لموضع واحد.",
    parameters: {
      type: "OBJECT",
      properties: {
        target_text: {
          type: "STRING",
          description: "الكلمة أو العبارة المتكررة المراد استبدالها في كافة مواضع الفصل (إجباري)",
        },
        new_text: {
          type: "STRING",
          description: "النص البديل الجديد المختلف عن النص الأصلي (إجباري)",
        },
        scope: {
          type: "STRING",
          enum: ["chapter"],
          description: "نطاق الاستبدال ويجب أن يكون \"chapter\" حرفياً (إجباري)",
        },
        step_note: {
          type: "STRING",
          description: "سطر وصفي عربي موجز مولّد يصف الاستبدال الشامل حرفياً لعرضه في خطوات التنفيذ (إجباري)",
        },
      },
      required: ["target_text", "new_text", "scope", "step_note"],
    },
  },
  {
    name: "diacritize_scope",
    description: "تشغيل خط إنتاج الضبط اللغوي (تشكيل جزئي معتمد، فواصل أدبية، وهمزات) لنطاق محدد دون إرسال أي نصوص في الوسائط — النطاق فقط، والتطبيق ينفذ خط الإنتاج.",
    parameters: {
      type: "OBJECT",
      properties: {
        target: {
          type: "STRING",
          description: "نطاق الضبط اللغوي: إما معرف فقرة يبدأ بـ b_ أو \"chapter\" للفصل كاملاً (إجباري)",
        },
        step_note: {
          type: "STRING",
          description: "سطر وصفي عربي موجز مولّد يصف نطاق الضبط لعرضه في خطوات التنفيذ (إجباري)",
        },
      },
      required: ["target", "step_note"],
    },
  },
];

export type AIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thought?: string;
  rawParts?: any[];
  timestamp: Date;
  isNew?: boolean;
  isStreaming?: boolean;
};

export type StoryContext = {
  title: string;
  fullText: string;
  chapters?: { title: string; content: string }[];
  isNovelMode?: boolean;
};

function cleanHtmlText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatStoryContextForAI(story: StoryContext): string {
  const titleStr = story.title?.trim() || "حكاية بدون عنوان";
  let contentBody = "";

  if (story.isNovelMode && story.chapters && story.chapters.length > 0) {
    contentBody = story.chapters
      .map((c, i) => `=== الفصل ${i + 1}: ${c.title || "بدون عنوان"} ===\n${cleanHtmlText(c.content)}`)
      .join("\n\n");
  } else {
    contentBody = cleanHtmlText(story.fullText);
  }

  if (!contentBody.trim()) {
    contentBody = "(المحرر فارغ)";
  }

  return `[سياق العمل الأدبي الحالي للكاتبة رحمة السيد موافي]
عنوان العمل: "${titleStr}"

[النص الكامل للحكاية المكتوبة في المحرر]:
${contentBody}
[نهاية سياق العمل الأدبي]`;
}

/**
 * Initial API call to Gemini upon opening the assistant for a story:
 * Reads the story and generates a real, dynamic literary greeting tailored specifically to the story's characters and events.
 * Operates through the SmartKeyRotator to guarantee uninterrupted connectivity.
 */
export async function initializeStoryAssistant(
  storyContext: StoryContext
): Promise<string> {
  const contextBlock = formatStoryContextForAI(storyContext);
  const fullSystemInstruction = `${RAHMA_MOWAFI_SYSTEM_PROMPT}\n\n${contextBlock}`;

  const userInitialPrompt = `الآن وبناءً على قراءتك العميقة للنص المرفق بالكامل، رحّب بالكاتبة رحمة السيد موافي ترحيباً أدبياً بليغاً ورفيعاً، واذكر لها استيعابك الصريح لشخصيات وأحداث الحكاية المكتوبة حتى الآن، واعرض عليها استعدادك التام لمعاونتها الأدبية وفق القواعد الحاكمة.`;

  try {
    return await executeWithSmartRotation(async (apiKey) => {
      // Direct call on mobile / custom key
      if (apiKey) {
        const directRes = await generateGeminiDirectly({
          apiKey,
          systemInstruction: fullSystemInstruction,
          contents: [{ role: "user", parts: [{ text: userInitialPrompt }] }],
          generationConfig: { ...buildReasoningConfig("init", 0.7) },
        });
        if (directRes.text) return directRes.text;
      } else {
        // Server-side fallback for web environment
        const res = await fetch("/api/gemini/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: fullSystemInstruction,
            contents: [{ role: "user", parts: [{ text: userInitialPrompt }] }],
            model: GEMINI_PRIMARY_MODEL,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text) return data.text;
        }
      }

      return `أهلاً بكِ يا أستاذة رحمة. قرأتُ عملكِ الأدبي بعناية فائقة واستوعبتُ كافة أبعاده السردية. يسعدني مرافقتكِ في تطوير الحكاية وصقل النص. كيف ترغبين أن نبدأ الآن؟`;
    });
  } catch (error) {
    console.error("Error in initializeStoryAssistant:", error);
    return `أهلاً بكِ يا أستاذة رحمة. قرأتُ عملكِ الأدبي بعناية فائقة واستوعبتُ كافة أبعاده السردية. يسعدني مرافقتكِ في تطوير الحكاية وصقل النص. كيف ترغبين أن نبدأ الآن؟`;
  }
}


export interface StructuredMemory {
  storyDecisions: string[];
  characterFacts: string[];
  plotFacts: string[];
  styleRules: string[];
  writerPreferences: string[];
  openTasks: string[];
  executedEdits: string[];
}

export interface StructuredMemoryEntry {
  memory: StructuredMemory;
  lastIncludedMessageId: string;
}

function getStructuredMemory(key: string): StructuredMemoryEntry {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = localStorage.getItem(`story_memory_${key}`);
      if (stored) return JSON.parse(stored);
    } catch(e) {}
  }
  return {
    memory: {
      storyDecisions: [],
      characterFacts: [],
      plotFacts: [],
      styleRules: [],
      writerPreferences: [],
      openTasks: [],
      executedEdits: []
    },
    lastIncludedMessageId: ""
  };
}

function saveStructuredMemory(key: string, entry: StructuredMemoryEntry) {
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem(`story_memory_${key}`, JSON.stringify(entry));
  }
}


const SUMMARIZE_PROMPT = `أنت مساعد تلخيص أدبي احترافي وموجز للغاية.
مهمتك هي مراجعة تاريخ المحادثة السابقة وتحديث الذاكرة التراكمية المنظمة للمحادثة.
قم بدمج المعلومات الجديدة مع الذاكرة السابقة بدقة واحترافية بدون تكرار، وأصلح أي تعارضات.
تأكد من الحفاظ على الحقائق القديمة إذا لم يتم نفيها.
يجب أن تعيد الناتج حصرياً ككائن JSON بالصيغة التالية (بدون أي نصوص إضافية):
{
  "storyDecisions": ["قرار 1", "قرار 2"],
  "characterFacts": ["حقيقة 1"],
  "plotFacts": [],
  "styleRules": [],
  "writerPreferences": [],
  "openTasks": [],
  "executedEdits": []
}`;

async function generateCumulativeSummary(
  oldMemory: StructuredMemory,
  newMessages: AIMessage[]
): Promise<StructuredMemory> {
  const newMessagesText = newMessages
    .map((m) => `${m.role === "user" ? "الكاتبة" : "المساعد"}: ${m.content}`)
    .join("\n");

  const userPrompt = `الذاكرة التراكمية السابقة المنظمة:
${JSON.stringify(oldMemory)}

الرسائل الجديدة:
${newMessagesText}

يرجى إعادة الذاكرة التراكمية الجديدة بصيغة JSON فقط:`;

  try {
    return await executeWithSmartRotation(async (apiKey) => {
      let textResponse = "";
      if (apiKey) {
        const directRes = await generateGeminiDirectly({
          apiKey,
          systemInstruction: SUMMARIZE_PROMPT,
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            ...buildReasoningConfig("summary", 0.1),
            responseMimeType: "application/json",
          },
        });
        textResponse = directRes.text || "{}";
      } else {
        const res = await fetch("/api/gemini/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: SUMMARIZE_PROMPT,
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            model: GEMINI_PRIMARY_MODEL,
            temperature: 0.1,
            thinkingLevel: "LOW",
            responseMimeType: "application/json",
          }),
        });
        const data = await res.json();
        textResponse = data.text || "{}";
      }
      
      const parsed = JSON.parse(textResponse);
      return {
        storyDecisions: Array.isArray(parsed.storyDecisions) ? parsed.storyDecisions : [],
        characterFacts: Array.isArray(parsed.characterFacts) ? parsed.characterFacts : [],
        plotFacts: Array.isArray(parsed.plotFacts) ? parsed.plotFacts : [],
        styleRules: Array.isArray(parsed.styleRules) ? parsed.styleRules : [],
        writerPreferences: Array.isArray(parsed.writerPreferences) ? parsed.writerPreferences : [],
        openTasks: Array.isArray(parsed.openTasks) ? parsed.openTasks : [],
        executedEdits: Array.isArray(parsed.executedEdits) ? parsed.executedEdits : []
      };
    });
  } catch (err) {
    console.warn("Failed to generate structured summary:", err);
    return oldMemory;
  }
}

/**
 * Send interactive user message to Gemini, maintaining conversation history & story context.
 * Uses the SmartKeyRotator to seamlessly and transparently rotate keys if a rate-limit error occurs.
 */
export async function streamLiteraryAssistantResponse(
  history: AIMessage[],
  userPrompt: string,
  storyContext: StoryContext,
  onChunk: (chunk: { text: string; thought: string; rawParts: any[] }) => void,
  mentionsContext?: string
): Promise<{ text: string; thought: string; rawParts: any[] }> {
  const contextBlock = formatStoryContextForAI(storyContext);
  const baseSystemInstruction = `${RAHMA_MOWAFI_SYSTEM_PROMPT}\n\n${contextBlock}${
    mentionsContext ? `\n\n${mentionsContext}` : ""
  }`;

  let enrichedSystemInstruction = baseSystemInstruction;
  let activeHistory = history;

  // Apply Sliding Window & Smart Cumulative Summarization if history is long
  if (history.length > 12) {
    const sessionKey = history[0].id || "temp-session";
    const limitIndex = history.length - 8;
    const messagesToSummarize = history.slice(0, limitIndex);
    activeHistory = history.slice(limitIndex);

    
    let cached = getStructuredMemory(sessionKey);
    const lastMsgToSummarize = messagesToSummarize[messagesToSummarize.length - 1];
    if (cached.lastIncludedMessageId !== lastMsgToSummarize.id) {
      let startIndex = 0;
      if (cached.lastIncludedMessageId) {
        const idx = messagesToSummarize.findIndex((m) => m.id === cached.lastIncludedMessageId);
        if (idx !== -1) {
          startIndex = idx + 1;
        }
      }
      const newMessagesForSummary = messagesToSummarize.slice(startIndex);
      if (newMessagesForSummary.length > 0) {
        try {
          console.log(`[Smart Summarization] Summarizing ${newMessagesForSummary.length} older messages...`);
          // Note: background summarization doesn't block the immediate request!
          // We fire and forget it to update the cache for the NEXT turn.
          generateCumulativeSummary(cached.memory, newMessagesForSummary).then((updatedMemory) => {
            saveStructuredMemory(sessionKey, {
              memory: updatedMemory,
              lastIncludedMessageId: lastMsgToSummarize.id
            });
          }).catch((err) => console.warn(err));
        } catch (sumErr) {
          console.warn("[Smart Summarization] Background summarization failed:", sumErr);
        }
      }
    }
    
    // Convert structured memory to text for the prompt
    const hasAnyMemory = Object.values(cached.memory).some(arr => arr && arr.length > 0);
    if (hasAnyMemory) {
      let formattedMemory = `[الذاكرة التراكمية للقصة والقرارات]:\n`;
      if (cached.memory.storyDecisions?.length) formattedMemory += `- قرارات القصة:\n  * ${cached.memory.storyDecisions.join("\n  * ")}\n`;
      if (cached.memory.characterFacts?.length) formattedMemory += `- معلومات الشخصيات:\n  * ${cached.memory.characterFacts.join("\n  * ")}\n`;
      if (cached.memory.plotFacts?.length) formattedMemory += `- الأحداث والحبكة:\n  * ${cached.memory.plotFacts.join("\n  * ")}\n`;
      if (cached.memory.styleRules?.length) formattedMemory += `- قواعد الأسلوب:\n  * ${cached.memory.styleRules.join("\n  * ")}\n`;
      if (cached.memory.writerPreferences?.length) formattedMemory += `- تفضيلات الكاتبة:\n  * ${cached.memory.writerPreferences.join("\n  * ")}\n`;
      if (cached.memory.openTasks?.length) formattedMemory += `- المهام المفتوحة:\n  * ${cached.memory.openTasks.join("\n  * ")}\n`;
      if (cached.memory.executedEdits?.length) formattedMemory += `- التعديلات المنفذة مسبقاً:\n  * ${cached.memory.executedEdits.join("\n  * ")}\n`;
      enrichedSystemInstruction += `\n\n${formattedMemory}\n[نهاية الذاكرة التراكمية]`;
    }
  }


  // Build full contents payload with (potentially sliced) conversation history
  const contents = activeHistory
    .filter((msg) => (msg.content && msg.content.trim()) || (msg.rawParts && msg.rawParts.length > 0))
    .map((msg) => ({
      role: (msg.role === "user" ? "user" : "model") as "user" | "model",
      parts: msg.rawParts && msg.rawParts.length > 0 ? msg.rawParts : [{ text: msg.content }],
    }));

  contents.push({
    role: "user",
    parts: [{ text: userPrompt }],
  });

  try {
    return await executeWithSmartRotation(async (apiKey) => {
      let candidateAccumulated = "";
      let thoughtAccumulated = "";
      let rawPartsAccumulated: any[] = [];

      if (apiKey) {
        // Direct SSE streaming from Google Generative Language API
        try {
          const directRes = await streamGeminiDirectly({
            apiKey,
            systemInstruction: enrichedSystemInstruction,
            contents,
            onChunk,
            generationConfig: { ...buildReasoningConfig("advisory", 0.7) },
          });
          return directRes;
        } catch (streamErr: any) {
          if (
            isRateLimitError(streamErr?.status || 0, streamErr?.data, streamErr?.message) ||
            isInvalidKeyError(streamErr?.status || 0, streamErr?.data, streamErr?.message)
          ) {
            throw streamErr;
          }

          // Fallback to direct generateContent
          const genResult = await generateGeminiDirectly({
            apiKey,
            systemInstruction: enrichedSystemInstruction,
            contents,
            generationConfig: { ...buildReasoningConfig("advisory", 0.7) },
          });
          const textRes = genResult.text || "";
          onChunk({ text: textRes, thought: "", rawParts: [{ text: textRes }] });
          return { text: textRes, thought: "", rawParts: [{ text: textRes }] };
        }
      } else {
        // Web Server-side streaming with /api/gemini/stream
        try {
          const res = await fetch("/api/gemini/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: enrichedSystemInstruction,
              contents,
              model: GEMINI_PRIMARY_MODEL,
              temperature: 0.7,
              thinkingLevel: "HIGH",
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const err: any = new Error(
              errData?.error?.message || `Server streaming failed with status ${res.status}`
            );
            err.status = res.status;
            err.data = errData;
            throw err;
          }

          const reader = res.body?.getReader();
          const decoder = new TextDecoder("utf-8");
          if (!reader) {
            throw new Error("Response body is not readable");
          }

          let buffer = "";

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;
              const payloadStr = trimmed.slice(6).trim();
              if (payloadStr === "[DONE]") break;

              try {
                const parsed = JSON.parse(payloadStr);
                if (parsed.error) {
                  const err: any = new Error(parsed.error.message || "Server streaming error");
                  err.status = parsed.error.code || 500;
                  err.data = parsed;
                  throw err;
                }
                const chunkText = parsed.text || "";
                const chunkThought = parsed.thought || "";
                const chunkParts = parsed.rawParts || [];
                
                if (chunkParts.length > 0) rawPartsAccumulated = chunkParts;

                if (chunkText || chunkThought || chunkParts.length > 0) {
                  candidateAccumulated += chunkText;
                  thoughtAccumulated += chunkThought;
                  onChunk({ text: chunkText, thought: chunkThought, rawParts: chunkParts });
                }
              } catch (pErr: any) {
                if (pErr?.status) throw pErr;
              }
            }
          }

          if (buffer && buffer.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(buffer.slice(6).trim());
              const chunkText = parsed.text || "";
              const chunkThought = parsed.thought || "";
              const chunkParts = parsed.rawParts || [];
              if (chunkParts.length > 0) rawPartsAccumulated = chunkParts;

              if (chunkText || chunkThought || chunkParts.length > 0) {
                candidateAccumulated += chunkText;
                thoughtAccumulated += chunkThought;
                onChunk({ text: chunkText, thought: chunkThought, rawParts: chunkParts });
              }
            } catch {
              // ignore
            }
          }

          if (rawPartsAccumulated.length === 0) {
            if (thoughtAccumulated) {
              rawPartsAccumulated = [
                { text: thoughtAccumulated, thought: true },
                { text: candidateAccumulated },
              ];
            } else if (candidateAccumulated) {
              rawPartsAccumulated = [{ text: candidateAccumulated }];
            }
          }

          return { text: candidateAccumulated, thought: thoughtAccumulated, rawParts: rawPartsAccumulated };
        } catch (serverErr: any) {
          if (
            isRateLimitError(serverErr?.status || 0, serverErr?.data, serverErr?.message) ||
            isInvalidKeyError(serverErr?.status || 0, serverErr?.data, serverErr?.message)
          ) {
            throw serverErr;
          }

          // Fallback to /api/gemini/generate
          const fallbackRes = await fetch("/api/gemini/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: enrichedSystemInstruction,
              contents,
              model: GEMINI_PRIMARY_MODEL,
              temperature: 0.7,
              thinkingLevel: "HIGH",
            }),
          });

          if (!fallbackRes.ok) {
            const fallbackErrData = await fallbackRes.json().catch(() => ({}));
            const fErr: any = new Error(
              fallbackErrData?.error?.message || `Fallback failed: ${fallbackRes.status}`
            );
            fErr.status = fallbackRes.status;
            fErr.data = fallbackErrData;
            throw fErr;
          }

          const fallbackData = await fallbackRes.json();
          const textRes = fallbackData.text || "";
          onChunk({ text: textRes, thought: "", rawParts: [{ text: textRes }] });
          return { text: textRes, thought: "", rawParts: [{ text: textRes }] };
        }
      }
    });
  } catch (error: any) {
    console.error("Gemini response error in smart rotator:", error);
    let fallbackMessage =
      "عذراً يا أستاذة رحمة، حدث خطأ أثناء معالجة الطلب الأدبي. يرجى المحاولة مرة أخرى.";

    const errMsg = (error?.message || "").toLowerCase();
    if (
      errMsg.includes("high demand") ||
      errMsg.includes("503") ||
      errMsg.includes("unavailable") ||
      errMsg.includes("spikes in demand") ||
      errMsg.includes("overloaded")
    ) {
      fallbackMessage =
        "عذراً يا أستاذة رحمة، تشهد خوادم الذكاء الاصطناعي إقبالاً كبيراً مؤقتاً في هذه اللحظة. يرجى إعادة إرسال السؤال أو الملاحظة بعد بضع ثوانٍ وسأكون معكِ على الفور.";
    } else if (error instanceof AllKeysExhaustedError) {
      fallbackMessage = error.message;
    } else if (error instanceof NoActiveKeysConfiguredError) {
      fallbackMessage = error.message;
    } else if (isNetworkConnectionError(error)) {
      fallbackMessage =
        "تعذر الاتصال بالشبكة. يرجى التحقق من اتصال الإنترنت والمحاولة مجدداً.";
    }

    onChunk({ text: fallbackMessage, thought: "", rawParts: [{ text: fallbackMessage }] });
    return { text: fallbackMessage, thought: "", rawParts: [{ text: fallbackMessage }] };
  }
}

/**
 * دالة طلب القرار التنفيذي للوكيل الأدبي (Executive Decision Request)
 * تستخدم النمط الصارم: حرارة 0.2 ومستوى LOW والنموذج الأساسي أولاً (ثم السلم 3.7 ← 3.6 ← 3.5 عند الضغط)،
 * مع التحقق الشامل من مطابقة مخططات الاستدعاء الأربع.
 */
export async function requestExecutiveDecision({
  contents,
  executiveInstruction,
  tools,
}: {
  contents: any[];
  executiveInstruction?: string;
  tools?: any[];
}): Promise<{
  text: string;
  functionCalls: Array<{ name: string; args: any }>;
  model: string;
  error?: string;
}> {
  try {
    return await executeWithSmartRotation(async (apiKey) => {
      let rawData: {
        text: string;
        functionCalls: Array<{ name: string; args: any }>;
        model: string;
      };

      if (apiKey) {
        // Direct execution against Google Generative Language API (Tauri Desktop/Web with custom key)
        rawData = await generateGeminiDirectly({
          apiKey,
          systemInstruction: executiveInstruction || UNIFIED_AGENT_INSTRUCTION,
          contents,
          tools: tools || AGENTIC_TOOL_DECLARATIONS,
          generationConfig: { ...buildReasoningConfig("executive", 0.2) },
        });
      } else {
        // Server proxy endpoint (Web with environment variable GEMINI_API_KEY)
        const res = await fetch("/api/gemini/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(100_000),
          body: JSON.stringify({
            systemInstruction: executiveInstruction || UNIFIED_AGENT_INSTRUCTION,
            contents,
            model: GEMINI_PRIMARY_MODEL,
            temperature: 0.2,
            thinkingLevel: "LOW",
            tools: tools || AGENTIC_TOOL_DECLARATIONS,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const err: any = new Error(
            errData?.error?.message || `خطأ في خادم اتخاذ القرار التنفيذي: ${res.status}`
          );
          err.status = res.status;
          err.data = errData;
          throw err;
        }

        const data = await res.json();
        rawData = {
          text: data.text || "",
          functionCalls: data.functionCalls || [],
          model: data.model || GEMINI_PRIMARY_MODEL,
        };
      }

      const rawCalls = rawData.functionCalls || [];

      // تحقق صارم من صحة مخططات الاستدعاء (Schema Validation)
      const validatedCalls: Array<{ name: string; args: any }> = [];
      for (const call of rawCalls) {
        if (!call || typeof call !== "object") continue;
        const { name, args } = call;
        if (!name || !args || typeof args !== "object") continue;

        if (name === "replace_text") {
          if (
            typeof args.block_id === "string" &&
            args.block_id.startsWith("b_") &&
            typeof args.target_text === "string" &&
            typeof args.new_text === "string" &&
            typeof args.step_note === "string" &&
            args.step_note.trim().length > 0
          ) {
            validatedCalls.push({
              name,
              args: {
                block_id: args.block_id.trim(),
                target_text: args.target_text,
                new_text: args.new_text,
                step_note: args.step_note.trim(),
              },
            });
          }
        } else if (name === "insert_text") {
          if (
            typeof args.anchor_block_id === "string" &&
            args.anchor_block_id.startsWith("b_") &&
            (args.position === "after" || args.position === "before") &&
            typeof args.new_text === "string" &&
            typeof args.step_note === "string" &&
            args.step_note.trim().length > 0
          ) {
            validatedCalls.push({
              name,
              args: {
                anchor_block_id: args.anchor_block_id.trim(),
                position: args.position,
                new_text: args.new_text,
                step_note: args.step_note.trim(),
              },
            });
          }
        } else if (name === "delete_text") {
          if (
            typeof args.block_id === "string" &&
            args.block_id.startsWith("b_") &&
            typeof args.step_note === "string" &&
            args.step_note.trim().length > 0
          ) {
            validatedCalls.push({
              name,
              args: {
                block_id: args.block_id.trim(),
                step_note: args.step_note.trim(),
              },
            });
          }
        } else if (name === "ask_writer") {
          if (
            typeof args.question === "string" &&
            args.question.trim().length > 0 &&
            ["SCOPE", "AMBIGUOUS", "NOT_FOUND", "MULTI"].includes(args.reason)
          ) {
            validatedCalls.push({
              name,
              args: {
                question: args.question.trim(),
                reason: args.reason,
              },
            });
          }
        } else if (name === "merge_blocks") {
          if (
            typeof args.block_id_a === "string" &&
            args.block_id_a.startsWith("b_") &&
            typeof args.block_id_b === "string" &&
            args.block_id_b.startsWith("b_") &&
            args.block_id_a.trim() !== args.block_id_b.trim() &&
            typeof args.step_note === "string" &&
            args.step_note.trim().length > 0
          ) {
            validatedCalls.push({
              name,
              args: {
                block_id_a: args.block_id_a.trim(),
                block_id_b: args.block_id_b.trim(),
                step_note: args.step_note.trim(),
              },
            });
          }
        } else if (name === "move_block") {
          if (
            typeof args.block_id === "string" &&
            args.block_id.startsWith("b_") &&
            typeof args.anchor_block_id === "string" &&
            args.anchor_block_id.startsWith("b_") &&
            args.block_id.trim() !== args.anchor_block_id.trim() &&
            (args.position === "after" || args.position === "before") &&
            typeof args.step_note === "string" &&
            args.step_note.trim().length > 0
          ) {
            validatedCalls.push({
              name,
              args: {
                block_id: args.block_id.trim(),
                anchor_block_id: args.anchor_block_id.trim(),
                position: args.position,
                step_note: args.step_note.trim(),
              },
            });
          }
        } else if (name === "split_text") {
          if (
            typeof args.block_id === "string" &&
            args.block_id.startsWith("b_") &&
            typeof args.split_after_text === "string" &&
            args.split_after_text.length > 0 &&
            typeof args.step_note === "string" &&
            args.step_note.trim().length > 0
          ) {
            validatedCalls.push({
              name,
              args: {
                block_id: args.block_id.trim(),
                split_after_text: args.split_after_text,
                step_note: args.step_note.trim(),
              },
            });
          }
        } else if (name === "replace_all") {
          if (
            typeof args.target_text === "string" &&
            args.target_text.length > 0 &&
            typeof args.new_text === "string" &&
            args.target_text !== args.new_text &&
            args.scope === "chapter" &&
            typeof args.step_note === "string" &&
            args.step_note.trim().length > 0
          ) {
            validatedCalls.push({
              name,
              args: {
                target_text: args.target_text,
                new_text: args.new_text,
                scope: "chapter",
                step_note: args.step_note.trim(),
              },
            });
          }
        } else if (name === "diacritize_scope") {
          const isTargetValid =
            args.target === "chapter" ||
            (typeof args.target === "string" && args.target.startsWith("b_"));
          if (
            isTargetValid &&
            typeof args.step_note === "string" &&
            args.step_note.trim().length > 0
          ) {
            validatedCalls.push({
              name,
              args: {
                target: args.target.trim(),
                step_note: args.step_note.trim(),
              },
            });
          }
        }
      }

      return {
        text: rawData.text || "",
        functionCalls: validatedCalls,
        model: rawData.model || GEMINI_PRIMARY_MODEL,
      };
    });
  } catch (err: any) {
    console.error("[Executive Decision Request Failed]:", err);
    let friendlyError =
      "عذراً يا أستاذة رحمة، تعذر تنفيذ القرار الأدبي حالياً. يمكنكِ إعادة المحاولة.";

    const msg = (err?.message || "").toLowerCase();
    const isTimeout =
      err?.name === "TimeoutError" ||
      err?.name === "AbortError" ||
      msg.includes("timeout") ||
      msg.includes("aborted") ||
      msg.includes("abort");

    if (isTimeout) {
      friendlyError =
        "تعذر إكمال الاتصال بالنموذج خلال المهلة — حاولي مجدداً";
    } else if (
      msg.includes("high demand") ||
      msg.includes("503") ||
      msg.includes("unavailable") ||
      msg.includes("overloaded")
    ) {
      friendlyError =
        "الخوادم تشهد ضغطاً مؤقتاً أثناء التجهيز للتعديل. يرجى الضغط على زر الإعادة للمتابعة فوراً.";
    } else if (err instanceof AllKeysExhaustedError || err instanceof NoActiveKeysConfiguredError) {
      friendlyError = err.message;
    } else if (isNetworkConnectionError(err)) {
      friendlyError =
        "تعذر الاتصال بالشبكة لإتمام التعديل الجراحي. يرجى التحقق من الإنترنت ثم إعادة المحاولة.";
    }

    return {
      text: "",
      functionCalls: [],
      model: GEMINI_PRIMARY_MODEL,
      error: friendlyError,
    };
  }
}

/**
 * توليد تمهيد سياقي للوكيل في حال لم يُرجع النموذج نصاً تمهيدياً مع دوال الاستدعاء
 */
export function generateDefaultAgentIntro(
  _userPrompt: string,
  calls: Array<{ name: string; args: any }>
): string {
  const count = calls.length;
  const firstNote = (calls[0]?.args as any)?.step_note;
  if (firstNote) {
    return `على الرحب والسعة يا أستاذة رحمة؛ سأباشر الآن تنفيذ التعديل في النص: ${firstNote}.`;
  }
  return `على الرحب والسعة يا أستاذة رحمة؛ سأقوم الآن بتنفيذ ${
    count > 1 ? `${count} خطوات جراحية` : "الخطوة الجراحية المطلوبة"
  } على النص بعناية لتتطابق النتيجة مع رؤيتك الأدبية:`;
}

/**
 * نص ختامي احتياطي سريع وأنيق في حال تعذر الاتصال الإضافي
 */
export function generateDefaultAgentSummary(
  steps: Array<{ toolName?: string; stepNote?: string }>
): string {
  const count = steps.length;
  if (count <= 1) {
    const note = steps[0]?.stepNote;
    return `تم بحمد الله تطبيق التعديل على النص بدقة متناهية${
      note ? `؛ حيث تم ${note}` : ""
    }.\n\nهل ترغبين يا أستاذة رحمة في ضبط أي جزئية أخرى، أو إضفاء لمسات أدبية إضافية على هذا المقطع؟`;
  }
  return `تم بحمد الله إنجاز كافة الخطوات المطلوبة (${count} خطوات) وتحديث النص في المحرر بدقة بالغة.\n\nهل تودين يا أستاذة رحمة مراجعة أي مقطع آخر أو تجربة صياغات إضافية؟`;
}

/**
 * توليد ملخص ختامي أدبي موجز ومحترف بعد إنجاز خطوات الوكيل التنفيذي
 */
export async function generateAgentCompletionSummary({
  userPrompt,
  executedSteps,
  storyTitle,
}: {
  userPrompt: string;
  executedSteps: Array<{ toolName: string; stepNote: string }>;
  storyTitle?: string;
}): Promise<string> {
  const stepsSummary = executedSteps
    .map((s, i) => `${i + 1}. ${s.stepNote || s.toolName}`)
    .join("\n");

  const prompt = `أنت المحرر الأدبي الخاص بالكاتبة رحمة السيد موافي في حكايتها "${storyTitle || "العمل الأدبي"}".
أنهيت الآن للتو بنجاح تنفيذ التعديلات الجراحية التالية على النص المكتوب داخل المحرر:
${stepsSummary}

بناءً على طلب الكاتبة الأصلي: "${userPrompt}"

المطلوب: اكتب رداً ختامياً بليغاً وموجزاً جداً (في سطرين إلى ثلاثة أسطر):
1. أخبر الكاتبة بلباقة واعتزاز بما تم إنجازه وتحسينه في النص.
2. اسألها باحترام وود إن كانت ترغب في مراجعة أي جزئية أخرى أو إضفاء مزيد من اللمسات الأدبية على هذا المقطع أو الانتقال لموضع آخر.
3. اكتب مباشرة كنص حواري أنيق دون مقدمات أو حشو أو استدعاء أدوات.`;

  try {
    return await executeWithSmartRotation(async (apiKey) => {
      if (apiKey) {
        const directResult = await generateGeminiDirectly({
          apiKey,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { ...buildReasoningConfig("summary", 0.3) },
        });
        return directResult.text.trim() || generateDefaultAgentSummary(executedSteps);
      } else {
        const res = await fetch("/api/gemini/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(100_000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            model: GEMINI_PRIMARY_MODEL,
            temperature: 0.3,
            thinkingLevel: "LOW",
          }),
        });

        if (!res.ok) throw new Error("Failed to generate agent summary");
        const data = await res.json();
        const text = (data.text || "").trim();
        return text || generateDefaultAgentSummary(executedSteps);
      }
    });
  } catch {
    return generateDefaultAgentSummary(executedSteps);
  }
}

