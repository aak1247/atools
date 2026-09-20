import numpy as np
from PIL import Image, ImageDraw, ImageFont
import math

def generate_realistic_contract_sample():
    width, height = 1000, 1414

    # 1. Base paper with subtle texture and scanner lighting gradient
    base = np.full((height, width, 3), [249, 248, 245], dtype=np.float32)
    y_grad = np.linspace(0.985, 1.01, height)[:, None, None]
    x_grad = np.linspace(0.992, 1.0, width)[None, :, None]
    base = base * y_grad * x_grad
    noise = np.random.normal(0, 1.2, (height, width, 3))
    paper_arr = np.clip(base + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(paper_arr)
    draw = ImageDraw.Draw(img)

    # Fonts
    font_title = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc', 28)
    font_subtitle = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 13)
    font_heading = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 15)
    font_body = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 13)
    font_body_bold = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 13)

    # 2. Header
    draw.text((width//2, 90), '技术服务与开发合作协议', font=font_title, fill=(35, 38, 42), anchor='mm')
    draw.text((width - 90, 140), '合同编号：HT-2026-0318', font=font_subtitle, fill=(90, 95, 102), anchor='rm')

    # Separator line
    draw.line([(90, 155), (width - 90, 155)], fill=(180, 185, 190), width=1)

    # Parties
    y = 185
    draw.text((90, y), '甲方（委托方）：北京华远智创科技有限公司', font=font_body_bold, fill=(40, 44, 50))
    y += 28
    draw.text((90, y), '乙方（受托方）：上海融通云数信息服务有限公司', font=font_body_bold, fill=(40, 44, 50))
    y += 38

    # Clauses
    clauses = [
        ('鉴于双方友好协商，就数字化系统架构咨询及核心模块开发支持事宜达成如下协议：', False),
        ('第一条  服务范围与交付标准', True),
        ('1.1 乙方负责按甲方要求完成核心数据接口联调及相关微服务组件的技术架构支持；', False),
        ('1.2 甲方应配合提供业务联调环境与必要的数据权限，并在收到交付件后5个工作日内完成验收。', False),
        ('第二条  费用结算与付款期限', True),
        ('2.1 本协议项下技术服务总费用为人民币肆拾捌万元整（¥480,000.00）；', False),
        ('2.2 协议生效后5个工作日内支付首期预付款40%，联调验收合格后支付剩余60%尾款。', False),
        ('第三条  保密责任与知识产权归属', True),
        ('3.1 双方对合作期间接触到的技术文档、源码及商业信息负有终身保密义务；', False),
        ('3.2 本项目专项研发成果的全部知识产权自验收合格之日起归甲方独家所有。', False),
        ('第四条  签署与效力', True),
        ('本协议一式贰份，双方签字并加盖公司公章或合同专用章后生效，具同等法律效力。', False),
    ]

    for text, is_hd in clauses:
        if is_hd:
            y += 18
            draw.text((90, y), text, font=font_heading, fill=(30, 35, 40))
            y += 26
        else:
            draw.text((90, y), text, font=font_body, fill=(50, 55, 60))
            y += 22

    # 3. Signing Block (Professional layout with dedicated seal stamping area)
    y = 780
    draw.line([(90, y), (width - 90, y)], fill=(200, 205, 210), width=1)
    y += 35

    col1_x = 100
    col2_x = 550

    draw.text((col1_x, y), '甲方（盖章）：北京华远智创科技有限公司', font=font_body_bold, fill=(35, 40, 45))
    draw.text((col2_x, y), '乙方（盖章）：上海融通云数信息服务有限公司', font=font_body_bold, fill=(35, 40, 45))

    # Dedicated clean stamping space
    y_stamp_center = y + 130
    y_after_stamp = y + 260

    draw.text((col1_x, y_after_stamp), '法定代表人或授权代表：', font=font_body, fill=(60, 65, 70))
    draw.text((col2_x, y_after_stamp), '法定代表人或授权代表：', font=font_body, fill=(60, 65, 70))

    # Signatures
    font_sig = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc', 22)
    draw.text((col1_x + 170, y_after_stamp - 5), '周建国', font=font_sig, fill=(20, 25, 35))
    draw.text((col2_x + 170, y_after_stamp - 5), '李晓华', font=font_sig, fill=(25, 25, 40))

    y_date = y_after_stamp + 45
    draw.text((col1_x, y_date), '签署日期：2026年 03月 18日', font=font_body, fill=(60, 65, 70))
    draw.text((col2_x, y_date), '签署日期：2026年 03月 18日', font=font_body, fill=(60, 65, 70))

    # 4. Generate high-quality stamped red seal
    seal_size = 300
    seal_img = Image.new('RGBA', (seal_size, seal_size), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(seal_img)
    cx, cy = seal_size // 2, seal_size // 2
    radius = 125

    seal_color = (218, 38, 44, 245)

    # Outer circle
    for w in range(5):
        sdraw.ellipse([cx - radius + w, cy - radius + w, cx + radius - w, cy + radius - w], outline=seal_color)

    # 5-pointed star
    star_r = 35
    star_pts = []
    for i in range(5):
        a = (18 + i * 72) * math.pi / 180 - math.pi / 2
        star_pts.append((cx + math.cos(a) * star_r, cy + math.sin(a) * star_r))
        ia = (54 + i * 72) * math.pi / 180 - math.pi / 2
        star_pts.append((cx + math.cos(ia) * (star_r * 0.4), cy + math.sin(ia) * (star_r * 0.4)))
    sdraw.polygon(star_pts, fill=seal_color)

    # Circular text
    seal_text = '上海融通云数信息服务有限公司'
    font_seal = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc', 22)
    total_angle = math.pi * 1.15
    start_angle = -math.pi / 2 - total_angle / 2
    step = total_angle / (len(seal_text) - 1)
    text_radius = radius - 26

    for i, ch in enumerate(seal_text):
        ang = start_angle + i * step
        c_img = Image.new('RGBA', (50, 50), (0, 0, 0, 0))
        cdraw = ImageDraw.Draw(c_img)
        cdraw.text((25, 25), ch, font=font_seal, fill=seal_color, anchor='mm')
        rot_deg = -(ang * 180 / math.pi + 90)
        c_rot = c_img.rotate(rot_deg, resample=Image.Resampling.BICUBIC)
        px = int(cx + math.cos(ang) * text_radius - 25)
        py = int(cy + math.sin(ang) * text_radius - 25)
        seal_img.alpha_composite(c_rot, (px, py))

    # Bottom text: 合同专用章
    font_sub = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 18)
    sdraw.text((cx, cy + int(radius * 0.52)), '合同专用章', font=font_sub, fill=seal_color, anchor='mm')

    # Physical stamp ink texture (pores and slight unevenness)
    s_arr = np.array(seal_img)
    ink_mask = s_arr[:, :, 3] > 0
    noise_tex = np.random.normal(0.96, 0.06, (seal_size, seal_size))
    dropouts = (np.random.random((seal_size, seal_size)) < 0.012) & ink_mask
    noise_tex[dropouts] *= 0.4
    s_arr[:, :, 3] = np.clip(s_arr[:, :, 3].astype(float) * noise_tex, 0, 255).astype(np.uint8)
    seal_realistic = Image.fromarray(s_arr)

    # Slight physical stamp rotation (-1.8 degrees)
    seal_rotated = seal_realistic.rotate(-1.8, resample=Image.Resampling.BICUBIC, expand=True)

    # Place seal in Party B stamping area (cleanly below header, above date, with ample breathing room)
    stamp_x = col2_x + 120
    stamp_y = y_stamp_center - seal_rotated.height // 2 + 35

    doc_rgba = img.convert('RGBA')
    doc_rgba.alpha_composite(seal_rotated, (stamp_x, stamp_y))

    # Slight scanner rotation (0.12 deg)
    doc_scanned = doc_rgba.rotate(0.12, resample=Image.Resampling.BICUBIC, fillcolor=(246, 245, 242, 255))

    doc_scanned.convert('RGB').save('public/samples/sample-contract-seal.jpg', quality=95)
    print('Generated clean, realistic public/samples/sample-contract-seal.jpg successfully')

if __name__ == '__main__':
    generate_realistic_contract_sample()
